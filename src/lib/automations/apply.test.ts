import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BoardColumn, ContentAsset, ContentItem } from '@/lib/types';
import { applyEffects } from './apply';
import type { AutomationEffect, AutomationEvent } from './types';

interface Write {
  table: string;
  values: Record<string, unknown>;
  id: string;
}

/**
 * Enough of the client to see what applyEffects touches. Every write is recorded rather
 * than performed, so a test can assert on when it happened as well as whether it did.
 */
function fakeSupabase(writes: Write[]) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: (_column: string, value: string) => {
          if (builder.pending) {
            writes.push({ table, values: builder.pending, id: value });
            builder.pending = null;
          }
          return builder;
        },
        update(values: Record<string, unknown>) {
          builder.pending = values;
          return builder;
        },
        single: async () => ({ data: { id: 'col-published' } }),
        pending: null as Record<string, unknown> | null,
      };
      return builder;
    },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as SupabaseClient;
}

const column: BoardColumn = {
  id: 'col-approved',
  key: 'approved',
  name: 'Approved',
  stage: 'approved',
  position: 6,
  wip_limit: null,
  default_role: 'scheduler',
};

const asset: ContentAsset = {
  id: 'asset-3',
  content_item_id: 'card-1',
  kind: 'working',
  version: 3,
  file_name: 'teaser.png',
  mime_type: 'image/png',
  byte_size: 1024,
  drive_file_id: 'drive-file-1',
  drive_url: null,
  drive_parent_id: 'working-folder',
  filed_at: null,
  filing_error: null,
  filing_attempts: 0,
  uploaded_by: 'user-2',
  created_at: '2026-09-14T00:00:00Z',
};

const event: AutomationEvent = {
  trigger: 'card.moved',
  card: { id: 'card-1' } as ContentItem,
  fromColumn: null,
  toColumn: column,
  assets: [asset],
  actorId: 'user-1',
  now: new Date('2026-09-14T00:00:00Z'),
};

const markFinal: AutomationEffect[] = [
  { type: 'mark_asset_final', assetId: 'asset-3', ruleId: 'rule-1' },
];

describe('applyEffects', () => {
  it('writes nothing until the caller commits', async () => {
    const writes: Write[] = [];

    const { patch } = await applyEffects(fakeSupabase(writes), event, markFinal);

    // The whole point: a move can still be refused after this returns, by a WIP limit or
    // by RLS, and a refused move must not have filed a creative into Drive.
    expect(writes).toEqual([]);
    expect(patch).toEqual({});
  });

  it('marks the asset final once committed', async () => {
    const writes: Write[] = [];

    const { commit } = await applyEffects(fakeSupabase(writes), event, markFinal);
    await commit();

    expect(writes).toEqual([
      { table: 'content_assets', values: { kind: 'final' }, id: 'asset-3' },
    ]);
  });

  it('still returns the patch without writing', async () => {
    const writes: Write[] = [];

    const { patch } = await applyEffects(fakeSupabase(writes), event, [
      { type: 'assign_profile', profileId: 'user-9', ruleId: 'rule-2' },
      { type: 'set_due_date', date: '2026-09-18', ruleId: 'rule-2' },
    ]);

    expect(patch).toEqual({ assignee_id: 'user-9', due_date: '2026-09-18' });
    expect(writes).toEqual([]);
  });
});
