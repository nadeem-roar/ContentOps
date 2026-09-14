import { createClient } from '@/lib/supabase/server';
import { InboxList, type InboxRow } from '@/components/inbox-list';

export const metadata = { title: 'Inbox · ContentOps' };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: 'unread' | 'all' }>;
}) {
  const { filter = 'unread' } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('comment_recipients')
    .select(
      `
        read_at,
        reason,
        comment:comments!inner (
          id, body, created_at, resolved_at, content_item_id,
          author:profiles!comments_author_id_fkey ( id, full_name, avatar_url ),
          content_item:content_items!inner (
            id, title, channel,
            client:clients ( name, brand_color ),
            campaign:campaigns ( name )
          )
        )
      `,
    )
    .order('created_at', { referencedTable: 'comments', ascending: false })
    .limit(100);

  if (filter === 'unread') query = query.is('read_at', null);

  const { data } = await query;

  return <InboxList rows={(data ?? []) as unknown as InboxRow[]} filter={filter} />;
}
