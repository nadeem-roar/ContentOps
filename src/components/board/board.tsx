'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { moveCard } from '@/app/actions/board';
import type { BoardColumn } from '@/lib/types';
import { Column } from './column';
import { CardTile, type BoardCardRow } from './card-tile';
import { BoardFilters } from './filters';
import { NewCardDialog } from './new-card-dialog';
import { Alert } from './alert';

interface BoardProps {
  columns: BoardColumn[];
  cards: BoardCardRow[];
  clients: { id: string; name: string; slug: string }[];
  campaigns: { id: string; name: string; client_id: string }[];
  activeFilters: { client?: string; campaign?: string; mine?: string };
}

export function Board({ columns, cards, clients, campaigns, activeFilters }: BoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);

  // Optimistic: the card jumps immediately, and snaps back if a rule refuses the move.
  const [optimisticCards, applyOptimistic] = useOptimistic(
    cards,
    (state: BoardCardRow[], move: { cardId: string; toColumnId: string; position: number }) =>
      state.map((c) =>
        c.id === move.cardId ? { ...c, column_id: move.toColumnId, position: move.position } : c,
      ),
  );

  const sensors = useSensors(
    // A small threshold so a click to open a card is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardCardRow[]>();
    for (const column of columns) map.set(column.id, []);
    for (const card of optimisticCards) {
      map.get(card.column_id)?.push(card);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [columns, optimisticCards]);

  const draggingCard = optimisticCards.find((c) => c.id === draggingId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);

    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    const card = optimisticCards.find((c) => c.id === cardId);
    if (!card) return;

    // Dropping on a column drops at the end; dropping on a card inserts above it.
    const overId = String(over.id);
    const overColumn = columns.find((c) => c.id === overId);
    const overCard = optimisticCards.find((c) => c.id === overId);
    const toColumnId = overColumn?.id ?? overCard?.column_id;
    if (!toColumnId) return;

    const target = (byColumn.get(toColumnId) ?? []).filter((c) => c.id !== cardId);

    let before: number | null;
    let after: number | null;

    if (overCard && !overColumn) {
      const index = target.findIndex((c) => c.id === overCard.id);
      before = index > 0 ? target[index - 1].position : null;
      after = target[index]?.position ?? null;
    } else {
      before = target.length > 0 ? target[target.length - 1].position : null;
      after = null;
    }

    if (toColumnId === card.column_id && before === null && after === null) return;

    const nextPosition =
      before === null && after === null
        ? 1000
        : before === null
          ? after! - 1000
          : after === null
            ? before + 1000
            : (before + after) / 2;

    startTransition(async () => {
      applyOptimistic({ cardId, toColumnId, position: nextPosition });

      const result = await moveCard({
        cardId,
        toColumnId,
        beforePosition: before,
        afterPosition: after,
      });

      if (!result.ok) {
        setBlockers(result.blockers ?? [result.error ?? 'That move was refused.']);
      }

      // Re-read either way: on success to pick up automation side effects
      // (assignee, due date), on failure to undo the optimistic jump.
      router.refresh();
    });
  }

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/board?${params.toString()}`);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <BoardFilters
        clients={clients}
        active={activeFilters}
        onChange={setFilter}
        action={<NewCardDialog clients={clients} campaigns={campaigns} />}
      />

      {blockers ? (
        <Alert
          title={blockers.length > 1 ? 'That move was refused' : 'Not so fast'}
          messages={blockers}
          onDismiss={() => setBlockers(null)}
        />
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto p-4">
          {columns.map((column) => {
            const columnCards = byColumn.get(column.id) ?? [];
            return (
              <SortableContext
                key={column.id}
                items={columnCards.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <Column column={column} cards={columnCards} />
              </SortableContext>
            );
          })}
        </div>

        <DragOverlay>
          {draggingCard ? <CardTile card={draggingCard} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
