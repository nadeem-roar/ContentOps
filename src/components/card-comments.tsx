'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { postComment, resolveThread } from '@/app/actions/comments';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
  parent_id: string | null;
  author: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

export function CardComments({ cardId, comments }: { cardId: string; comments: CommentRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function send() {
    const body = draft.trim();
    if (!body) return;

    startTransition(async () => {
      const result = await postComment({ contentItemId: cardId, body });
      if (!result.ok) {
        setError(result.error ?? 'Could not post that.');
        return;
      }
      setError(null);
      setDraft('');
      router.refresh();
    });
  }

  return (
    <section className="mt-4 rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Discussion</h2>

      <ul className="mt-3 space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-2.5">
            <Avatar name={comment.author?.full_name} src={comment.author?.avatar_url} />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {comment.author?.full_name ?? 'Someone'}
                </span>
                <span>{formatDistanceToNow(parseISO(comment.created_at))} ago</span>
                {comment.resolved_at ? <Badge variant="success">resolved</Badge> : null}

                {!comment.resolved_at && !comment.parent_id ? (
                  <button
                    className="ml-auto underline"
                    onClick={() =>
                      startTransition(async () => {
                        await resolveThread(comment.id);
                        router.refresh();
                      })
                    }
                  >
                    Resolve
                  </button>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
            </div>
          </li>
        ))}

        {comments.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            Nothing here yet. Feedback on this card belongs here, not in chat.
          </li>
        ) : null}
      </ul>

      <div className="mt-4 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add feedback. Use @name to pull someone in."
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <Button size="sm" disabled={!draft.trim()} onClick={send}>
            Post
          </Button>
        </div>
      </div>
    </section>
  );
}
