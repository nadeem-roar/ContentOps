import { createClient } from '@/lib/supabase/server';
import { Board } from '@/components/board/board';
import type { BoardColumn } from '@/lib/types';

export const metadata = { title: 'Board · ContentOps' };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; campaign?: string; mine?: string }>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let cardQuery = supabase.from('board_cards').select('*').order('position');

  if (filters.client) cardQuery = cardQuery.eq('client_slug', filters.client);
  if (filters.campaign) cardQuery = cardQuery.eq('campaign_id', filters.campaign);
  if (filters.mine === '1' && user) cardQuery = cardQuery.eq('assignee_id', user.id);

  const [{ data: columns }, { data: cards }, { data: clients }] = await Promise.all([
    supabase.from('board_columns').select('*').order('position'),
    cardQuery,
    supabase.from('clients').select('id, name, slug').eq('is_archived', false).order('name'),
  ]);

  return (
    <Board
      columns={(columns ?? []) as BoardColumn[]}
      cards={cards ?? []}
      clients={clients ?? []}
      activeFilters={filters}
    />
  );
}
