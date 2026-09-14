'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Check, CheckCheck } from 'lucide-react';
import { markRead, postComment, resolveThread } from '@/app/actions/comments';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface InboxRow {
  read_at: string | null;
  reason: string;
  comment: {
    id: string;
    body: string;
    created_at: string;
    resolved_at: string | null;
    content_item_id: string;
    author: { id: string; full_name: string | null; avatar_url: string | null } | null;
    content_item: {
      id: string;
      title: string;
      channel: string;
      client: { name: string; brand_color: string | null } | null;
      campaign: { name: string } | null;
    };
  };
}

export function InboxList({ rows, filter }: { rows: InboxRow[]; filter: 'unread' | 'all' }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function sendReply(row: InboxRow) {
    const body = draft.trim();
    if (!body) return;

    run(async () => {
      await postComment({
        contentItemId: row.comment.content_item_id,
        body,
        parentId: row.comment.id,
      });
      await markRead([row.comment.id]);
      setDraft('');
      setReplyingTo(null);
    });
  }

  const unreadIds = rows.filter((r) => !r.read_at).map((r) => r.comment.id);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Inbox</h1>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={filter === 'unread' ? 'secondary' : 'ghost'}
            onClick={() => router.push('/inbox?filter=unread')}
          >
            Unread
          </Button>
          <Button
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => router.push('/inbox?filter=all')}
          >
            All
          </Button>
        </div>

        {unreadIds.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => run(() => markRead(unreadIds))}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        ) : null}
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {filter === 'unread' ? 'Nothing unread. Inbox zero.' : 'No messages yet.'}
        </p>
      ) : null}

      <ul className="space-y-2">
        {rows.map((row) => {
          const { comment } = row;
          const item = comment.content_item;

          return (
            <li
              key={comment.id}
              className={cn(
                'rounded-lg border bg-card p-3 shadow-sm',
                !row.read_at && 'border-l-2 border-l-primary',
              )}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar name={comment.author?.full_name} src={comment.author?.avatar_url} />
                <span className="font-medium text-foreground">
                  {comment.author?.full_name ?? 'Someone'}
                </span>
                <span>· {formatDistanceToNow(parseISO(comment.created_at))} ago</span>
                {comment.resolved_at ? (
                  <Badge variant="success" className="ml-1">
                    resolved
                  </Badge>
                ) : null}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                <Link href={`/board/${item.id}`} className="font-medium hover:underline">
                  {item.title}
                </Link>
                {item.client ? (
                  <Badge
                    variant="outline"
                    style={
                      item.client.brand_color
                        ? { borderColor: item.client.brand_color, color: item.client.brand_color }
                        : undefined
                    }
                  >
                    {item.client.name}
                  </Badge>
                ) : null}
                {item.campaign ? (
                  <span className="text-muted-foreground">{item.campaign.name}</span>
                ) : null}

                <div className="ml-auto flex items-center gap-1">
                  {!row.read_at ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => markRead([comment.id]))}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Read
                    </Button>
                  ) : null}

                  {!comment.resolved_at ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => resolveThread(comment.id))}
                    >
                      Resolve
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplyingTo(replyingTo === comment.id ? null : comment.id);
                      setDraft('');
                    }}
                  >
                    Reply
                  </Button>
                </div>
              </div>

              {replyingTo === comment.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Reply. Use @name to pull someone in."
                    className="min-h-[70px]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!draft.trim()} onClick={() => sendReply(row)}>
                      Send
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
