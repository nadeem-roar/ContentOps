import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { evaluate } from '@/lib/automations/engine';
import { applyEffects } from '@/lib/automations/apply';
import type { AutomationEvent, AutomationRule } from '@/lib/automations/types';
import type { BoardColumn, ContentAsset, ContentItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Moves scheduled cards on once their publish slot arrives.
 *
 * This does not post to the platforms; it advances the board so the team can see what
 * is live and what slipped. Wiring an actual publisher in later means adding one action
 * type to the engine, not rewriting this route.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [{ data: due }, { data: columns }, { data: rules }] = await Promise.all([
    supabase.rpc('due_for_publish'),
    supabase.from('board_columns').select('*'),
    supabase.from('automations').select('*').eq('is_enabled', true).eq('trigger', 'schedule.due'),
  ]);

  const allColumns = (columns ?? []) as BoardColumn[];
  const moved: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const card of (due ?? []) as ContentItem[]) {
    const fromColumn = allColumns.find((c) => c.id === card.column_id) ?? null;
    if (!fromColumn) continue;

    const { data: assets } = await supabase
      .from('content_assets')
      .select('*')
      .eq('content_item_id', card.id);

    const event: AutomationEvent = {
      trigger: 'schedule.due',
      card,
      fromColumn,
      // Nothing has moved yet, so the "destination" is where the card currently sits.
      // Rules decide where it goes.
      toColumn: fromColumn,
      assets: (assets ?? []) as ContentAsset[],
      actorId: null,
      now: new Date(),
    };

    const { blockers, effects } = evaluate((rules ?? []) as AutomationRule[], event);

    if (blockers.length > 0) {
      skipped.push({ id: card.id, reason: blockers[0].message });
      continue;
    }

    const { patch } = await applyEffects(supabase, event, effects);

    if (Object.keys(patch).length === 0) {
      skipped.push({ id: card.id, reason: 'No rule matched' });
      continue;
    }

    const { error } = await supabase.from('content_items').update(patch).eq('id', card.id);

    if (error) {
      skipped.push({ id: card.id, reason: error.message });
      continue;
    }

    await supabase.from('activity').insert({
      entity_type: 'content_item',
      entity_id: card.id,
      verb: 'card.auto_published',
      meta: { scheduled_for: card.scheduled_for },
    });

    moved.push(card.id);
  }

  return NextResponse.json({ due: (due ?? []).length, moved: moved.length, skipped });
}

export const GET = POST;
