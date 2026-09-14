'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { applyEffects } from '@/lib/automations/apply';
import { evaluate } from '@/lib/automations/engine';
import type { AutomationEvent, AutomationRule } from '@/lib/automations/types';
import type { BoardColumn, ContentAsset, ContentItem } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  /** Rule messages explaining why a move was refused. */
  blockers?: string[];
  notifications?: string[];
  error?: string;
}

const moveSchema = z.object({
  cardId: z.string().uuid(),
  toColumnId: z.string().uuid(),
  beforePosition: z.number().nullable(),
  afterPosition: z.number().nullable(),
});

function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1000;
  if (before === null) return after! - 1000;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}

/**
 * Moves a card and runs every automation bound to the move.
 *
 * The order matters: evaluate first, refuse the whole move if any rule blocks, and only
 * then write. A half-applied move (card in Design, automation half-run) is worse than
 * no move at all.
 */
export async function moveCard(input: z.infer<typeof moveSchema>): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid move request.' };

  const { cardId, toColumnId, beforePosition, afterPosition } = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const [{ data: card }, { data: columns }, { data: assets }, { data: rules }] = await Promise.all([
    supabase.from('content_items').select('*').eq('id', cardId).single(),
    supabase.from('board_columns').select('*'),
    supabase.from('content_assets').select('*').eq('content_item_id', cardId),
    supabase.from('automations').select('*').eq('is_enabled', true),
  ]);

  if (!card) return { ok: false, error: 'Card not found.' };

  const toColumn = (columns as BoardColumn[] | null)?.find((c) => c.id === toColumnId);
  if (!toColumn) return { ok: false, error: 'Target column not found.' };

  const fromColumn = (columns as BoardColumn[] | null)?.find((c) => c.id === card.column_id) ?? null;

  const event: AutomationEvent = {
    trigger: 'card.moved',
    card: card as ContentItem,
    fromColumn,
    toColumn,
    assets: (assets ?? []) as ContentAsset[],
    actorId: user.id,
    now: new Date(),
  };

  const { blockers, effects } = evaluate((rules ?? []) as AutomationRule[], event);

  if (blockers.length > 0) {
    return { ok: false, blockers: blockers.map((b) => b.message) };
  }

  const { patch, notifications, commit } = await applyEffects(supabase, event, effects);

  const { data: moved, error } = await supabase
    .from('content_items')
    .update({
      ...patch,
      // An automation-driven column move (e.g. auto-publish) wins over the drag target.
      column_id: patch.column_id ?? toColumnId,
      position: positionBetween(beforePosition, afterPosition),
    })
    .eq('id', cardId)
    .select('id');

  if (error) {
    // WIP limits and stage guards surface as check violations from the database.
    return { ok: false, blockers: [error.message] };
  }

  // RLS filters a forbidden update out rather than failing it, so "no error" is not the
  // same as "it happened". Everyone starts as a viewer, who cannot write cards at all.
  if (!moved || moved.length === 0) {
    return { ok: false, error: 'You do not have permission to move this card.' };
  }

  // Only now that the card has genuinely moved: mark assets final, tick telemetry.
  await commit();

  await supabase.from('activity').insert({
    entity_type: 'content_item',
    entity_id: cardId,
    actor_id: user.id,
    verb: 'card.moved',
    meta: { from: fromColumn?.key ?? null, to: toColumn.key, rules: effects.map((e) => e.ruleId) },
  });

  revalidatePath('/board');
  revalidatePath('/calendar');

  return { ok: true, notifications };
}

const scheduleSchema = z.object({
  cardId: z.string().uuid(),
  scheduledFor: z.string().datetime().nullable(),
});

export async function scheduleCard(input: z.infer<typeof scheduleSchema>): Promise<ActionResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid schedule request.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: updated, error } = await supabase
    .from('content_items')
    .update({ scheduled_for: parsed.data.scheduledFor })
    .eq('id', parsed.data.cardId)
    .select('id');

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'You do not have permission to schedule this card.' };
  }

  await supabase.from('activity').insert({
    entity_type: 'content_item',
    entity_id: parsed.data.cardId,
    actor_id: user.id,
    verb: 'card.scheduled',
    meta: { scheduled_for: parsed.data.scheduledFor },
  });

  revalidatePath('/board');
  revalidatePath('/calendar');
  return { ok: true };
}

const updateSchema = z.object({
  cardId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  hook: z.string().max(500).nullable().optional(),
  caption: z.string().max(5000).nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export async function updateCard(input: z.infer<typeof updateSchema>): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid card update.' };

  const { cardId, ...fields } = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: updated, error } = await supabase
    .from('content_items')
    .update(fields)
    .eq('id', cardId)
    .select('id');

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'You do not have permission to edit this card.' };
  }

  revalidatePath('/board');
  return { ok: true };
}
