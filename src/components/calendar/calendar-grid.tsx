'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { scheduleCard } from '@/app/actions/board';
import type { BoardCardRow } from '@/components/board/card-tile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Default publish slot when someone drops a card on a day without picking a time. */
const DEFAULT_HOUR = 9;

export function CalendarGrid({
  monthStart,
  scheduled,
  unscheduled,
}: {
  monthStart: string;
  scheduled: BoardCardRow[];
  unscheduled: BoardCardRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const month = parseISO(monthStart);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, BoardCardRow[]>();
    for (const card of scheduled) {
      if (!card.scheduled_for) continue;
      const key = format(parseISO(card.scheduled_for), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), card]);
    }
    return map;
  }, [scheduled]);

  function goToMonth(delta: number) {
    router.push(`/calendar?month=${format(addMonths(month, delta), 'yyyy-MM')}`);
  }

  /** Place the selected card on a day. Clicking a day with nothing selected does nothing. */
  function placeOnDay(day: Date) {
    if (!selected) return;

    const slot = new Date(day);
    slot.setHours(DEFAULT_HOUR, 0, 0, 0);

    startTransition(async () => {
      const result = await scheduleCard({
        cardId: selected,
        scheduledFor: slot.toISOString(),
      });

      if (!result.ok) setError(result.error ?? 'Could not schedule that card.');
      else setError(null);

      setSelected(null);
      router.refresh();
    });
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-2.5">
          <h1 className="text-sm font-semibold">{format(month, 'MMMM yyyy')}</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => goToMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => goToMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {selected ? (
            <p className="ml-2 text-sm text-muted-foreground">
              Pick a day to schedule it.{' '}
              <button className="underline" onClick={() => setSelected(null)}>
                Cancel
              </button>
            </p>
          ) : null}
          {error ? <p className="ml-2 text-sm text-destructive">{error}</p> : null}
        </header>

        <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
          {DAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-1.5">
              {label}
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7 auto-rows-fr overflow-y-auto">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const cards = byDay.get(key) ?? [];
            const outsideMonth = !isSameMonth(day, month);

            return (
              <div
                key={key}
                onClick={() => placeOnDay(day)}
                className={cn(
                  'min-h-24 border-b border-r p-1.5 transition-colors',
                  outsideMonth && 'bg-muted/30 text-muted-foreground',
                  selected && 'cursor-copy hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs',
                    isToday(day) && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {format(day, 'd')}
                </span>

                <div className="mt-1 space-y-1">
                  {cards.map((card) => (
                    <Link
                      key={card.id}
                      href={`/board/${card.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate rounded border-l-2 bg-card px-1.5 py-1 text-[11px] leading-tight shadow-sm hover:bg-accent"
                      style={{ borderLeftColor: card.client_brand_color ?? 'hsl(var(--border))' }}
                      title={`${card.client_name} · ${card.title}`}
                    >
                      <span className="text-muted-foreground">
                        {card.scheduled_for ? format(parseISO(card.scheduled_for), 'HH:mm') : ''}
                      </span>{' '}
                      {card.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="flex w-72 shrink-0 flex-col border-l">
        <header className="border-b px-3 py-2.5">
          <h2 className="text-sm font-semibold">Approved, unscheduled</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ready to go out. Select one, then click a day.
          </p>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {unscheduled.map((card) => (
            <button
              key={card.id}
              onClick={() => setSelected(selected === card.id ? null : card.id)}
              className={cn(
                'w-full rounded-lg border bg-card p-2 text-left text-xs shadow-sm transition-colors hover:bg-accent',
                selected === card.id && 'ring-2 ring-primary',
              )}
            >
              <p className="font-medium leading-snug">{card.title}</p>
              <p className="mt-1 text-muted-foreground">
                {card.client_name} · {card.channel}
              </p>
            </button>
          ))}

          {unscheduled.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nothing waiting. The queue is clear.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
