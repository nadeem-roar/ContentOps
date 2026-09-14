import { createClient } from '@/lib/supabase/server';
import { CalendarGrid } from '@/components/calendar/calendar-grid';

export const metadata = { title: 'Calendar · ContentOps' };

/** Month bounds in UTC, padded so the grid's leading and trailing days are covered. */
function monthRange(month: string | undefined) {
  const base = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : new Date();

  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));

  const paddedStart = new Date(start);
  paddedStart.setUTCDate(paddedStart.getUTCDate() - 7);
  const paddedEnd = new Date(end);
  paddedEnd.setUTCDate(paddedEnd.getUTCDate() + 7);

  return { start, end, paddedStart, paddedEnd };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const { start, paddedStart, paddedEnd } = monthRange(month);
  const supabase = await createClient();

  const [{ data: scheduled }, { data: unscheduled }] = await Promise.all([
    supabase
      .from('board_cards')
      .select('*')
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', paddedStart.toISOString())
      .lt('scheduled_for', paddedEnd.toISOString())
      .order('scheduled_for'),
    // Approved work with nowhere to go yet: the queue the scheduler works from.
    supabase
      .from('board_cards')
      .select('*')
      .is('scheduled_for', null)
      .not('approved_at', 'is', null)
      .order('approved_at')
      .limit(50),
  ]);

  return (
    <CalendarGrid
      monthStart={start.toISOString()}
      scheduled={scheduled ?? []}
      unscheduled={unscheduled ?? []}
    />
  );
}
