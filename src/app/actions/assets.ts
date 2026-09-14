'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const MAX_BYTES = 500 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
]);

/**
 * Uploads a creative against a card. The file goes to Supabase Storage; the Drive copy
 * is made later by the sync worker, and only once the card is approved.
 */
export async function uploadAsset(formData: FormData) {
  const contentItemId = String(formData.get('contentItemId') ?? '');
  const file = formData.get('file');

  if (!z.string().uuid().safeParse(contentItemId).success) {
    return { ok: false, error: 'Invalid card.' };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a file to upload.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'That file is over the 500 MB limit.' };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: `${file.type || 'That file type'} is not accepted.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Storage path is opaque; the human-readable name is applied on the Drive copy.
  const storagePath = `${contentItemId}/${crypto.randomUUID()}`;

  const upload = await supabase.storage
    .from('creatives')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (upload.error) return { ok: false, error: upload.error.message };

  const { error } = await supabase.from('content_assets').insert({
    content_item_id: contentItemId,
    file_name: file.name,
    mime_type: file.type,
    byte_size: file.size,
    storage_path: storagePath,
    uploaded_by: user.id,
    kind: 'working',
  });

  if (error) {
    // Do not leave an orphan blob behind if the row failed to write.
    await supabase.storage.from('creatives').remove([storagePath]);
    return { ok: false, error: error.message };
  }

  revalidatePath('/board');
  return { ok: true };
}

/**
 * Marks an asset final by hand. Approving a card does this automatically, but a designer
 * sometimes wants to nominate which version is the keeper before review.
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
