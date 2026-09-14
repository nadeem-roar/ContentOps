import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureCampaignFolder, uploadFile } from './client';
import { driveFileName } from './naming';

const MAX_ATTEMPTS = 5;

export interface SyncOutcome {
  assetId: string;
  status: 'uploaded' | 'failed' | 'skipped';
  driveUrl?: string;
  error?: string;
}

/**
 * Uploads every approved creative that has not reached Drive yet.
 *
 * The queue is just "final assets with no synced_to_drive_at", which means this is safe
 * to run on a timer, safe to run twice, and self-healing after an outage. Assets that
 * have failed MAX_ATTEMPTS times are left alone and surfaced in the UI rather than
 * retried forever.
 */
export async function syncPendingAssets(
  supabase: SupabaseClient,
  limit = 25,
): Promise<SyncOutcome[]> {
  const { data: pending, error } = await supabase
    .from('content_assets')
    .select(
      `
        id, version, file_name, mime_type, storage_path, sync_attempts,
        content_item:content_items (
          id, channel, format, scheduled_for,
          client:clients ( id, name ),
          campaign:campaigns ( id, name )
        )
      `,
    )
    .eq('kind', 'final')
    .is('synced_to_drive_at', null)
    .lt('sync_attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const outcomes: SyncOutcome[] = [];

  for (const asset of pending ?? []) {
    const item = asset.content_item as any;

    if (!asset.storage_path || !item?.client?.name) {
      outcomes.push({ assetId: asset.id, status: 'skipped' });
      continue;
    }

    try {
      const { finalFolderId, campaignFolderId } = await ensureCampaignFolder(
        item.client.name,
        item.campaign?.name ?? null,
      );

      const download = await supabase.storage.from('creatives').download(asset.storage_path);
      if (download.error || !download.data) {
        throw download.error ?? new Error('Storage returned no file');
      }

      const buffer = Buffer.from(await download.data.arrayBuffer());

      const uploaded = await uploadFile({
        name: driveFileName({
          clientName: item.client.name,
          campaignName: item.campaign?.name ?? null,
          channel: item.channel,
          format: item.format,
          scheduledFor: item.scheduled_for,
          version: asset.version,
          originalFileName: asset.file_name,
          mimeType: asset.mime_type,
        }),
        mimeType: asset.mime_type ?? 'application/octet-stream',
        parentId: finalFolderId,
        body: buffer,
      });

      await supabase
        .from('content_assets')
        .update({
          drive_file_id: uploaded.fileId,
          drive_url: uploaded.webViewLink,
          synced_to_drive_at: new Date().toISOString(),
          sync_error: null,
          sync_attempts: (asset.sync_attempts ?? 0) + 1,
        })
        .eq('id', asset.id);

      // Cache the campaign folder so the UI can deep-link without another Drive call.
      if (item.campaign?.id) {
        await supabase
          .from('campaigns')
          .update({ drive_folder_id: campaignFolderId })
          .eq('id', item.campaign.id)
          .is('drive_folder_id', null);
      }

      await supabase.from('activity').insert({
        entity_type: 'content_item',
        entity_id: item.id,
        verb: 'asset.synced_to_drive',
        meta: { asset_id: asset.id, drive_url: uploaded.webViewLink },
      });

      outcomes.push({ assetId: asset.id, status: 'uploaded', driveUrl: uploaded.webViewLink });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await supabase
        .from('content_assets')
        .update({
          sync_error: message.slice(0, 500),
          sync_attempts: (asset.sync_attempts ?? 0) + 1,
        })
        .eq('id', asset.id);

      outcomes.push({ assetId: asset.id, status: 'failed', error: message });
    }
  }

  return outcomes;
}
