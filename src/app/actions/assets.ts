'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Uploading is not a Server Action: creatives go straight to Drive as a raw stream via
 * POST /api/assets/upload, because a Server Action would buffer the whole file in memory
 * and is capped by bodySizeLimit.
 *
 * What is left here is the small state change around an upload.
 */

/**
 * Marks an asset final by hand. Approving a card does this automatically, but a designer
 * sometimes wants to nominate which version is the keeper before review.
 *
 * This only sets the flag. The filing worker does the Drive move, so the file is never
 * touched from inside a request.
 */
export async function markAssetFinal(assetId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase
    .from('content_assets')
    .update({ kind: 'final' })
    .eq('id', assetId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/board');
  return { ok: true };
}
