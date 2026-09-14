import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CardComments } from '@/components/card-comments';
import { AssetPanel } from '@/components/asset-panel';

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { data: card } = await supabase
    .from('content_items')
    .select(
      `
        *,
        client:clients ( id, name, brand_color, drive_folder_id ),
        campaign:campaigns ( id, name ),
        assignee:profiles!content_items_assignee_id_fkey ( id, full_name, avatar_url ),
        column:board_columns ( id, name, stage )
      `,
    )
    .eq('id', cardId)
    .single();

  if (!card) notFound();

  const [{ data: assets }, { data: comments }] = await Promise.all([
    supabase
      .from('content_assets')
      .select('*')
      .eq('content_item_id', cardId)
      .order('version', { ascending: false }),
    supabase
      .from('comments')
      .select('*, author:profiles!comments_author_id_fkey ( id, full_name, avatar_url )')
      .eq('content_item_id', cardId)
      .order('created_at'),
  ]);

  const item = card as any;

  return (
    <div className="mx-auto max-w-4xl p-4">
      <Link
        href="/board"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to board
      </Link>

      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{item.column?.name}</Badge>
          <Badge
            variant="outline"
            style={
              item.client?.brand_color
                ? { borderColor: item.client.brand_color, color: item.client.brand_color }
                : undefined
            }
          >
            {item.client?.name}
          </Badge>
          {item.campaign ? <Badge variant="secondary">{item.campaign.name}</Badge> : null}
          <Badge variant="secondary">{item.channel}</Badge>
          <Badge variant="secondary">{item.format}</Badge>

          {item.assignee ? (
            <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <Avatar name={item.assignee.full_name} src={item.assignee.avatar_url} />
              {item.assignee.full_name}
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-xl font-semibold tracking-tight">{item.title}</h1>

        {item.hook ? <p className="mt-2 text-sm text-muted-foreground">{item.hook}</p> : null}

        {item.caption ? (
          <div className="mt-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Caption
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">{item.caption}</p>
          </div>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Due</dt>
            <dd>{item.due_date ? format(parseISO(item.due_date), 'd MMM yyyy') : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Scheduled</dt>
            <dd>
              {item.scheduled_for
                ? format(parseISO(item.scheduled_for), 'd MMM yyyy, HH:mm')
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Approved</dt>
            <dd>{item.approved_at ? format(parseISO(item.approved_at), 'd MMM yyyy') : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Priority</dt>
            <dd className="capitalize">{item.priority}</dd>
          </div>
        </dl>

        {item.client?.drive_folder_id ? (
          <a
            href={`https://drive.google.com/drive/folders/${item.client.drive_folder_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm underline"
          >
            Client Drive folder
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      <AssetPanel cardId={cardId} assets={assets ?? []} />
      <CardComments cardId={cardId} comments={(comments ?? []) as any} />
    </div>
  );
}
