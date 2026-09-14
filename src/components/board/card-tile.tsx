'use client';

import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, CloudUpload, ImageIcon, MessageSquare } from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ContentItem } from '@/lib/types';

/** Shape returned by the board_cards view. */
export interface BoardCardRow extends ContentItem {
  client_name: string;
  client_slug: string;
  client_brand_color: string | null;
  campaign_name: string | null;
  assignee_name: string | null;
  assignee_avatar_url: string | null;
  asset_count: number;
  unresolved_comment_count: number;
  latest_asset_version: number | null;
  has_unfiled_final: boolean | null;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-destructive',
  high: 'bg-amber-500',
  normal: 'bg-transparent',
  low: 'bg-transparent',
};

export function CardTile({ card, isOverlay }: { card: BoardCardRow; isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: isOverlay,
  });

  const overdue =
    card.due_date !== null && isPast(parseISO(card.due_date)) && card.published_at === null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing',
        isDragging && !isOverlay && 'opacity-40',
        isOverlay && 'rotate-2 shadow-lg',
      )}
    >
      {card.priority === 'urgent' || card.priority === 'high' ? (
        <span
          className={cn(
            'absolute left-0 top-3 h-6 w-1 rounded-r',
            PRIORITY_STYLES[card.priority],
          )}
          aria-label={`${card.priority} priority`}
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/board/${card.id}`}
          className="text-sm font-medium leading-snug hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {card.title}
        </Link>
        {card.assignee_id ? (
          <Avatar name={card.assignee_name} src={card.assignee_avatar_url} />
        ) : (
          <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground">
            unassigned
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="gap-1"
          style={
            card.client_brand_color
              ? { borderColor: card.client_brand_color, color: card.client_brand_color }
              : undefined
          }
        >
          {card.client_name}
        </Badge>
        <Badge variant="secondary">{card.channel}</Badge>
        <Badge variant="secondary">{card.format}</Badge>
      </div>

      {card.campaign_name ? (
        <p className="mt-2 truncate text-xs text-muted-foreground">{card.campaign_name}</p>
      ) : null}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        {card.asset_count > 0 ? (
          <span className="flex items-center gap-1" title={`${card.asset_count} creatives`}>
            <ImageIcon className="h-3.5 w-3.5" />
            v{card.latest_asset_version}
          </span>
        ) : null}

        {card.unresolved_comment_count > 0 ? (
          <span
            className="flex items-center gap-1"
            title={`${card.unresolved_comment_count} open comments`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {card.unresolved_comment_count}
          </span>
        ) : null}

        {card.has_unfiled_final ? (
          <span className="flex items-center gap-1 text-amber-600" title="Waiting to be filed into Drive">
            <CloudUpload className="h-3.5 w-3.5" />
            filing
          </span>
        ) : null}

        {card.scheduled_for ? (
          <span className="ml-auto flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            {format(parseISO(card.scheduled_for), 'd MMM HH:mm')}
          </span>
        ) : card.due_date ? (
          <span className={cn('ml-auto', overdue && 'font-medium text-destructive')}>
            due {format(parseISO(card.due_date), 'd MMM')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
