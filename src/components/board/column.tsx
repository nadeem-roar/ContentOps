'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { BoardColumn } from '@/lib/types';
import { CardTile, type BoardCardRow } from './card-tile';

export function Column({ column, cards }: { column: BoardColumn; cards: BoardCardRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const atLimit = column.wip_limit !== null && cards.length >= column.wip_limit;
  const overLimit = column.wip_limit !== null && cards.length > column.wip_limit;

  return (
    <section
      ref={setNodeRef}
      aria-label={column.name}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors',
        isOver && 'border-primary/50 bg-accent',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="text-sm font-semibold">{column.name}</h2>
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-xs tabular-nums',
            overLimit
              ? 'bg-destructive text-destructive-foreground'
              : atLimit
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                : 'text-muted-foreground',
          )}
          title={column.wip_limit ? `WIP limit ${column.wip_limit}` : undefined}
        >
          {cards.length}
          {column.wip_limit ? ` / ${column.wip_limit}` : ''}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {cards.map((card) => (
          <CardTile key={card.id} card={card} />
        ))}

        {cards.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here.</p>
        ) : null}
      </div>
    </section>
  );
}
