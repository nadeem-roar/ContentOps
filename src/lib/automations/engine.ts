import type { ContentItem } from '@/lib/types';
import type {
  AutomationConditions,
  AutomationEffect,
  AutomationEvent,
  AutomationRule,
  Blocker,
  EvaluationResult,
} from './types';

/** Adds N business days to a date, skipping Saturdays and Sundays. */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let remaining = Math.max(0, Math.trunc(days));

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return result;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function conditionsMatch(
  conditions: AutomationConditions,
  event: AutomationEvent,
): boolean {
  const { card, fromColumn, toColumn } = event;

  if (conditions.to_column && conditions.to_column !== toColumn.key) return false;
  if (conditions.to_stage && conditions.to_stage !== toColumn.stage) return false;

  // A from_* condition can never match a card that did not come from anywhere.
  if (conditions.from_column && conditions.from_column !== fromColumn?.key) return false;
  if (conditions.from_stage && conditions.from_stage !== fromColumn?.stage) return false;

  if (conditions.channel && conditions.channel !== card.channel) return false;
  if (conditions.client_id && conditions.client_id !== card.client_id) return false;
  if (conditions.campaign_id && conditions.campaign_id !== card.campaign_id) return false;

  return true;
}

function fieldIsEmpty(card: ContentItem, field: keyof ContentItem): boolean {
  const value = card[field];
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

const FIELD_LABELS: Partial<Record<keyof ContentItem, string>> = {
  caption: 'caption',
  hook: 'hook',
  scheduled_for: 'publish slot',
  due_date: 'due date',
  assignee_id: 'assignee',
};

/**
 * Decides what a single event should cause. Pure: no database, no clock, no network.
 *
 * Rules that block (`require_*`) are collected separately from rules that act. If
 * anything blocks, the caller refuses the whole move rather than half-applying it —
 * a card that lands in Design without a brief is exactly the mess this tool exists
 * to prevent.
 */
export function evaluate(rules: AutomationRule[], event: AutomationEvent): EvaluationResult {
  const blockers: Blocker[] = [];
  const effects: AutomationEffect[] = [];

  for (const rule of rules) {
    if (!rule.is_enabled) continue;
    if (rule.trigger !== event.trigger) continue;
    if (!conditionsMatch(rule.conditions ?? {}, event)) continue;

    for (const action of rule.actions ?? []) {
      switch (action.type) {
        case 'require_fields': {
          const missing = action.fields.filter((field) => fieldIsEmpty(event.card, field));
          if (missing.length > 0) {
            const labels = missing.map((f) => FIELD_LABELS[f] ?? String(f)).join(', ');
            blockers.push({
              ruleId: rule.id,
              ruleName: rule.name,
              message: action.message ?? `Missing before this can move: ${labels}.`,
            });
          }
          break;
        }

        case 'require_asset': {
          if (event.assets.length === 0) {
            blockers.push({
              ruleId: rule.id,
              ruleName: rule.name,
              message: action.message ?? 'This card needs at least one uploaded creative.',
            });
          }
          break;
        }

        case 'assign_to_column_role': {
          // Only fill an empty seat. Automation should never yank work off someone.
          if (!event.card.assignee_id && event.toColumn.default_role) {
            effects.push({
              type: 'assign_role',
              role: event.toColumn.default_role,
              ruleId: rule.id,
            });
          }
          break;
        }

        case 'assign_to': {
          effects.push({ type: 'assign_profile', profileId: action.profile_id, ruleId: rule.id });
          break;
        }

        case 'set_due_date': {
          // Respect a date a human already chose.
          if (!event.card.due_date) {
            effects.push({
              type: 'set_due_date',
              date: toDateOnly(addBusinessDays(event.now, action.business_days)),
              ruleId: rule.id,
            });
          }
          break;
        }

        case 'mark_latest_asset_final': {
          const latest = [...event.assets].sort((a, b) => b.version - a.version)[0];
          if (latest && latest.kind !== 'final') {
            effects.push({ type: 'mark_asset_final', assetId: latest.id, ruleId: rule.id });
          }
          break;
        }

        case 'queue_drive_filing': {
          effects.push({ type: 'queue_drive_filing', ruleId: rule.id });
          break;
        }

        case 'notify_assignee': {
          effects.push({ type: 'notify', message: action.message, ruleId: rule.id });
          break;
        }

        case 'move_to_column': {
          effects.push({ type: 'move_to_column', columnKey: action.column, ruleId: rule.id });
          break;
        }
      }
    }
  }

  // A blocked move applies nothing.
  return { blockers, effects: blockers.length > 0 ? [] : effects };
}
