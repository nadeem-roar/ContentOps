'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/drive/naming';

export interface CreateResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const CHANNELS = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
  'x',
  'blog',
  'email',
  'other',
] as const;

const FORMATS = [
  'static',
  'carousel',
  'reel',
  'story',
  'video',
  'article',
  'email',
  'other',
] as const;

const clientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1E88E5')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(2000).optional(),
});

export async function addClient(input: z.infer<typeof clientSchema>): Promise<CreateResult> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      brand_color: parsed.data.brand_color || null,
      notes: parsed.data.notes || null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A client with that name exists.' };
    // RLS refuses the write for roles below manager, which surfaces as an empty result.
    if (error.code === '42501') return { ok: false, error: 'Only admins and managers can add clients.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/clients');
  revalidatePath('/board');
  return { ok: true, id: data.id };
}

const campaignSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  objective: z.string().trim().max(500).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export async function addCampaign(input: z.infer<typeof campaignSchema>): Promise<CreateResult> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      client_id: parsed.data.client_id,
      name: parsed.data.name,
      objective: parsed.data.objective || null,
      start_date: parsed.data.start_date || null,
      end_date: parsed.data.end_date || null,
      owner_id: user?.id ?? null,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23514') {
      return { ok: false, error: 'The end date cannot be before the start date.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/campaigns');
  revalidatePath('/board');
  return { ok: true, id: data.id };
}

const cardSchema = z.object({
  title: z.string().trim().min(1).max(200),
  client_id: z.string().uuid(),
  campaign_id: z.string().uuid().optional().or(z.literal('')),
  channel: z.enum(CHANNELS),
  format: z.enum(FORMATS),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  hook: z.string().trim().max(500).optional(),
  due_date: z.string().optional(),
});

export async function addCard(input: z.infer<typeof cardSchema>): Promise<CreateResult> {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // New work always starts in the first column, whatever the board is called today.
  const { data: firstColumn } = await supabase
    .from('board_columns')
    .select('id')
    .order('position')
    .limit(1)
    .single();

  if (!firstColumn) return { ok: false, error: 'The board has no columns.' };

  // Put it at the top of that column rather than the bottom: a new idea is the one
  // you are thinking about now.
  const { data: topCard } = await supabase
    .from('content_items')
    .select('position')
    .eq('column_id', firstColumn.id)
    .order('position')
    .limit(1)
    .maybeSingle();

  const position = topCard ? topCard.position - 1000 : 1000;

  const { data, error } = await supabase
    .from('content_items')
    .insert({
      title: parsed.data.title,
      client_id: parsed.data.client_id,
      campaign_id: parsed.data.campaign_id || null,
      channel: parsed.data.channel,
      format: parsed.data.format,
      priority: parsed.data.priority,
      hook: parsed.data.hook || null,
      due_date: parsed.data.due_date || null,
      column_id: firstColumn.id,
      position,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from('activity').insert({
    entity_type: 'content_item',
    entity_id: data.id,
    actor_id: user.id,
    verb: 'card.created',
    meta: { title: parsed.data.title },
  });

  revalidatePath('/board');
  return { ok: true, id: data.id };
}
