'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const postSchema = z.object({
  contentItemId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
  parentId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
});

export async function postComment(input: z.infer<typeof postSchema>) {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Comment cannot be empty.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: comment, error } = await supabase
    .from('comments')
    .insert({
      content_item_id: parsed.data.contentItemId,
      body: parsed.data.body,
      parent_id: parsed.data.parentId ?? null,
      asset_id: parsed.data.assetId ?? null,
      author_id: user.id,
    })
    .select('id')
    .single();

  if (error || !comment) return { ok: false, error: error?.message ?? 'Could not post comment.' };

  // Work out who needs to see this: mentions, the assignee, and the rest of the thread.
  await supabase.rpc('fan_out_comment', { comment_id: comment.id });

  revalidatePath('/inbox');
  revalidatePath('/board');
  return { ok: true, id: comment.id };
}

export async function resolveThread(commentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase
    .from('comments')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', commentId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/inbox');
  return { ok: true };
}

export async function markRead(commentIds: string[]) {
  if (commentIds.length === 0) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase
    .from('comment_recipients')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', user.id)
    .is('read_at', null)
    .in('comment_id', commentIds);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/inbox');
  return { ok: true };
}
