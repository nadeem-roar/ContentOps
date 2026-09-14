import { describe, expect, it } from 'vitest';
import type { BoardColumn, ContentAsset, ContentItem } from '@/lib/types';
import { addBusinessDays, conditionsMatch, evaluate } from './engine';
import type { AutomationEvent, AutomationRule } from './types';

const column = (over: Partial<BoardColumn> = {}): BoardColumn => ({
  id: 'col-design',
  key: 'design',
  name: 'Design',
  stage: 'production',
  position: 4,
  wip_limit: 6,
  default_role: 'designer',
  ...over,
});

const card = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: 'card-1',
  campaign_id: 'camp-1',
  client_id: 'client-1',
  title: 'Launch teaser',
  hook: null,
  caption: null,
  channel: 'instagram',
  format: 'static',
  column_id: 'col-copy',
  position: 1000,
  assignee_id: null,
  created_by: 'user-1',
  priority: 'normal',
  due_date: null,
  scheduled_for: null,
  published_at: null,
  approved_at: null,
  approved_by: null,
  drive_folder_id: null,
  archived_at: null,
  created_at: '2026-09-14T00:00:00Z',
  updated_at: '2026-09-14T00:00:00Z',
  ...over,
});

const asset = (over: Partial<ContentAsset> = {}): ContentAsset => ({
  id: 'asset-1',
  content_item_id: 'card-1',
  kind: 'working',
  version: 1,
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
  ...over,
});

const event = (over: Partial<AutomationEvent> = {}): AutomationEvent => ({
  trigger: 'card.moved',
  card: card(),
  fromColumn: column({ id: 'col-copy', key: 'copy', name: 'Copywriting' }),
  toColumn: column(),
  assets: [],
  actorId: 'user-1',
  // A Monday, so business-day maths is unambiguous.
  now: new Date('2026-09-14T09:00:00Z'),
  ...over,
});

const rule = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  id: 'rule-1',
  name: 'Test rule',
  trigger: 'card.moved',
  conditions: {},
  actions: [],
  is_enabled: true,
  ...over,
});

describe('addBusinessDays', () => {
  it('skips the weekend', () => {
    // Thursday + 2 business days = Monday
    expect(addBusinessDays(new Date('2026-09-17T00:00:00Z'), 2).toISOString().slice(0, 10)).toBe(
      '2026-09-21',
    );
  });

  it('returns the same day for zero or negative input', () => {
    const monday = new Date('2026-09-14T00:00:00Z');
    expect(addBusinessDays(monday, 0).toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(addBusinessDays(monday, -3).toISOString().slice(0, 10)).toBe('2026-09-14');
  });
});

describe('conditionsMatch', () => {
  it('matches on destination column key', () => {
    expect(conditionsMatch({ to_column: 'design' }, event())).toBe(true);
    expect(conditionsMatch({ to_column: 'review' }, event())).toBe(false);
  });

  it('matches on destination stage', () => {
    expect(conditionsMatch({ to_stage: 'production' }, event())).toBe(true);
    expect(conditionsMatch({ to_stage: 'approved' }, event())).toBe(false);
  });

  it('never matches a from_ condition when the card came from nowhere', () => {
    expect(conditionsMatch({ from_column: 'copy' }, event({ fromColumn: null }))).toBe(false);
  });

  it('requires every supplied condition to hold', () => {
    const e = event();
    expect(conditionsMatch({ to_column: 'design', channel: 'instagram' }, e)).toBe(true);
    expect(conditionsMatch({ to_column: 'design', channel: 'linkedin' }, e)).toBe(false);
  });
});

describe('evaluate', () => {
  it('ignores disabled rules and other triggers', () => {
    const rules = [
      rule({ id: 'a', is_enabled: false, actions: [{ type: 'queue_drive_filing' }] }),
      rule({ id: 'b', trigger: 'schedule.due', actions: [{ type: 'queue_drive_filing' }] }),
    ];
    expect(evaluate(rules, event()).effects).toEqual([]);
  });

  it('blocks a move when a required field is empty', () => {
    const rules = [
      rule({
        conditions: { to_column: 'design' },
        actions: [{ type: 'require_fields', fields: ['caption'], message: 'Need copy first.' }],
      }),
    ];

    const result = evaluate(rules, event());
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].message).toBe('Need copy first.');
  });

  it('allows the move once the required field is filled', () => {
    const rules = [
      rule({
        conditions: { to_column: 'design' },
        actions: [{ type: 'require_fields', fields: ['caption'] }],
      }),
    ];

    const result = evaluate(rules, event({ card: card({ caption: 'Ship it.' }) }));
    expect(result.blockers).toEqual([]);
  });

  it('blocks review when no creative is attached', () => {
    const rules = [
      rule({ conditions: { to_stage: 'review' }, actions: [{ type: 'require_asset' }] }),
    ];

    const toReview = event({ toColumn: column({ key: 'review', stage: 'review' }) });
    expect(evaluate(rules, toReview).blockers).toHaveLength(1);
    expect(evaluate(rules, { ...toReview, assets: [asset()] }).blockers).toEqual([]);
  });

  it('applies nothing at all when any rule blocks', () => {
    const rules = [
      rule({ id: 'blocker', actions: [{ type: 'require_asset' }] }),
      rule({ id: 'actor', actions: [{ type: 'assign_to_column_role' }] }),
    ];

    const result = evaluate(rules, event());
    expect(result.blockers).toHaveLength(1);
    expect(result.effects).toEqual([]);
  });

  it('assigns the column role only when the card is unassigned', () => {
    const rules = [rule({ actions: [{ type: 'assign_to_column_role' }] })];

    expect(evaluate(rules, event()).effects).toEqual([
      { type: 'assign_role', role: 'designer', ruleId: 'rule-1' },
    ]);

    const taken = event({ card: card({ assignee_id: 'user-9' }) });
    expect(evaluate(rules, taken).effects).toEqual([]);
  });

  it('sets a due date from business days, leaving an existing date alone', () => {
    const rules = [rule({ actions: [{ type: 'set_due_date', business_days: 2 }] })];

    // Monday + 2 business days = Wednesday
    expect(evaluate(rules, event()).effects).toEqual([
      { type: 'set_due_date', date: '2026-09-16', ruleId: 'rule-1' },
    ]);

    const dated = event({ card: card({ due_date: '2026-10-01' }) });
    expect(evaluate(rules, dated).effects).toEqual([]);
  });

  it('marks the highest-version asset final and queues the Drive filing', () => {
    const rules = [
      rule({
        conditions: { to_stage: 'approved' },
        actions: [{ type: 'mark_latest_asset_final' }, { type: 'queue_drive_filing' }],
      }),
    ];

    const approved = event({
      toColumn: column({ key: 'approved', stage: 'approved', default_role: 'scheduler' }),
      assets: [asset({ id: 'v1', version: 1 }), asset({ id: 'v3', version: 3 }), asset({ id: 'v2', version: 2 })],
    });

    expect(evaluate(rules, approved).effects).toEqual([
      { type: 'mark_asset_final', assetId: 'v3', ruleId: 'rule-1' },
      { type: 'queue_drive_filing', ruleId: 'rule-1' },
    ]);
  });

  it('does not re-mark an asset that is already final', () => {
    const rules = [
      rule({ conditions: { to_stage: 'approved' }, actions: [{ type: 'mark_latest_asset_final' }] }),
    ];

    const approved = event({
      toColumn: column({ key: 'approved', stage: 'approved' }),
      assets: [asset({ id: 'v1', version: 1, kind: 'final' })],
    });

    expect(evaluate(rules, approved).effects).toEqual([]);
  });
});
