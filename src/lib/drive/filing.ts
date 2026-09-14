import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureCampaignFolders, moveAndRename } from './client';
import { driveFileName } from './naming';

const MAX_ATTEMPTS = 5;

export interface FilingOutcome {
  assetId: string;
  status: 'filed' | 'failed' | 'skipped';
  driveUrl?: string;
  error?: string;
}

/**
 * Files approved creatives: moves them from the campaign's Working/ folder into Final/
 * and renames them to the convention.
 *
 * Nothing is uploaded or copied here — the bytes have been in Drive since the designer
 * hit upload. This only moves a pointer, so it is fast, costs no bandwidth, and cannot
 * produce a second copy of a 500 MB video.
 *
 * The queue is "final assets with no filed_at", which makes this safe to run on a timer,
 * safe to run twice, and self-healing after an outage. Assets that have failed
 * MAX_ATTEMPTS times are left alone and surfaced on the card rather than retried forever.
 */
export async function fileApprovedAssets(
  supabase: SupabaseClient,
  limit = 25,
): Promise<FilingOutcome[]> {
  const { data: pending, error } = await supabase
    .from('content_assets')
    .select(
      `
        id, version, file_name, mime_type, drive_file_id, drive_parent_id, filing_attempts,
        content_item:content_items (
          id, channel, format, scheduled_for,
          client:clients ( id, name ),
          campaign:campaigns ( id, name )
        )
      `,
    )
    .eq('kind', 'final')
    .is('filed_at', null)
    .lt('filing_attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const outcomes: FilingOutcome[] = [];

  for (const asset of pending ?? []) {
    const item = asset.content_item as any;

    if (!asset.drive_file_id || !item?.client?.name) {
      outcomes.push({ assetId: asset.id, status: 'skipped' });
      continue;
    }

    try {
      const { finalFolderId, campaignFolderId } = await ensureCampaignFolders(
        item.client.name,
        item.campaign?.name ?? null,
      );

      const driveUrl = await moveAndRename({
        fileId: asset.drive_file_id,
        fromParentId: asset.drive_parent_id,
        toParentId: finalFolderId,
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
      });

      await supabase
        .from('content_assets')
        .update({
          drive_parent_id: finalFolderId,
          drive_url: driveUrl,
          filed_at: new Date().toISOString(),
          filing_error: null,
          // Not incremented: the count gates retries, so it has to mean failures.
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
        verb: 'asset.filed_to_drive',
        meta: { asset_id: asset.id, drive_url: driveUrl },
      });

      outcomes.push({ assetId: asset.id, status: 'filed', driveUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await supabase
        .from('content_assets')
        .update({
          filing_error: message.slice(0, 500),
          filing_attempts: (asset.filing_attempts ?? 0) + 1,
        })
        .eq('id', asset.id);

      outcomes.push({ assetId: asset.id, status: 'failed', error: message });
    }
  }

  return outcomes;
}
