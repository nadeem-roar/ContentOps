import type {
  BoardColumn,
  ContentAsset,
  ContentItem,
  StageType,
  UserRole,
} from '@/lib/types';

export type AutomationTrigger =
  | 'card.created'
  | 'card.moved'
  | 'asset.marked_final'
  | 'card.scheduled'
  | 'schedule.due';

export interface AutomationConditions {
  to_column?: string;
  from_column?: string;
  to_stage?: StageType;
  from_stage?: StageType;
  channel?: string;
  client_id?: string;
  campaign_id?: string;
}

export type AutomationAction =
  | { type: 'assign_to_column_role' }
  | { type: 'assign_to'; profile_id: string }
  | { type: 'set_due_date'; business_days: number }
  | { type: 'require_fields'; fields: (keyof ContentItem)[]; message?: string }
  | { type: 'require_asset'; message?: string }
  | { type: 'mark_latest_asset_final' }
  | { type: 'queue_drive_filing' }
  | { type: 'notify_assignee'; message: string }
  | { type: 'move_to_column'; column: string };

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationConditions;
  actions: AutomationAction[];
  is_enabled: boolean;
}

export interface AutomationEvent {
  trigger: AutomationTrigger;
  card: ContentItem;
  fromColumn: BoardColumn | null;
  toColumn: BoardColumn;
  assets: ContentAsset[];
  actorId: string | null;
  /** Injected so evaluation stays pure and tests can pin the clock. */
  now: Date;
}

/**
 * What the engine decides should happen. Effects are data; applying them to the
 * database is a separate, boring step in `apply.ts`.
 */
export type AutomationEffect =
  | { type: 'assign_role'; role: UserRole; ruleId: string }
  | { type: 'assign_profile'; profileId: string; ruleId: string }
  | { type: 'set_due_date'; date: string; ruleId: string }
  | { type: 'mark_asset_final'; assetId: string; ruleId: string }
  | { type: 'queue_drive_filing'; ruleId: string }
  | { type: 'notify'; message: string; ruleId: string }
  | { type: 'move_to_column'; columnKey: string; ruleId: string };

export interface Blocker {
  ruleId: string;
  ruleName: string;
  message: string;
}

export interface EvaluationResult {
  /** Non-empty means the move is refused and nothing is applied. */
  blockers: Blocker[];
  effects: AutomationEffect[];
}
