import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContentItem, UserRole } from '@/lib/types';
import type { AutomationEffect, AutomationEvent } from './types';

/**
 * Picks who on a role should pick up the card: the active member with that role who
 * currently holds the fewest unfinished cards. Ties break on whoever comes back first,
 * which is good enough and keeps the query cheap.
 */
export async function leastLoadedForRole(
  supabase: SupabaseClient,
  role: UserRole,
): Promise<string | null> {
  const { data: candidates } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', role)
    .eq('is_active', true);

  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const ids = candidates.map((c) => c.id);

  const { data: open } = await supabase
    .from('content_items')
    .select('assignee_id')
    .in('assignee_id', ids)
    .is('archived_at', null)
    .is('published_at', null);

  const load = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const row of open ?? []) {
    if (row.assignee_id) {
      load.set(row.assignee_id, (load.get(row.assignee_id) ?? 0) + 1);
    }
  }

  return [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

export interface ApplyResult {
  patch: Partial<ContentItem>;
  notifications: string[];
  queuedDriveFiling: boolean;
  appliedRuleIds: string[];
}

/**
 * Turns effects into a patch for the card plus any side writes. Returns the patch rather
 * than writing the card itself, so the caller can fold it into the same update that moves
 * the card and avoid a second round trip.
 */
export async function applyEffects(
  supabase: SupabaseClient,
  event: AutomationEvent,
  effects: AutomationEffect[],
): Promise<ApplyResult> {
  const patch: Partial<ContentItem> = {};
  const notifications: string[] = [];
  const appliedRuleIds: string[] = [];
  let queuedDriveFiling = false;

  for (const effect of effects) {
    appliedRuleIds.push(effect.ruleId);

    switch (effect.type) {
      case 'assign_role': {
        const assignee = await leastLoadedForRole(supabase, effect.role);
        if (assignee) patch.assignee_id = assignee;
        break;
      }

      case 'assign_profile': {
        patch.assignee_id = effect.profileId;
        break;
      }

      case 'set_due_date': {
        patch.due_date = effect.date;
        break;
      }

      case 'mark_asset_final': {
        await supabase
          .from('content_assets')
          .update({ kind: 'final' })
          .eq('id', effect.assetId);
        break;
      }

      case 'queue_drive_filing': {
        // The worker picks up final assets with no filed_at, so marking the asset final
        // is itself the enqueue. This flag just tells the caller to nudge the worker
        // instead of waiting for the next cron tick.
        queuedDriveFiling = true;
        break;
      }

      case 'notify': {
        notifications.push(effect.message);
        break;
      }

      case 'move_to_column': {
        const { data: target } = await supabase
          .from('board_columns')
          .select('id')
          .eq('key', effect.columnKey)
          .single();
        if (target) patch.column_id = target.id;
        break;
      }
    }
  }

  if (appliedRuleIds.length > 0) {
    const unique = [...new Set(appliedRuleIds)];
    await Promise.all(
      unique.map((id) =>
        supabase.rpc('bump_automation_run', { rule_id: id }).then(
          () => undefined,
          () => undefined, // Telemetry must never fail a card move.
        ),
      ),
    );
  }

  return { patch, notifications, queuedDriveFiling, appliedRuleIds };
}
