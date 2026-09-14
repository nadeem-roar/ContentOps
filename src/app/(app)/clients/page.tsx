import { createClient } from '@/lib/supabase/server';
import { ClientList } from '@/components/client-list';

export const metadata = { title: 'Clients · ContentOps' };

export default async function ClientsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: clients }, { data: profile }, { data: cards }] = await Promise.all([
    supabase.from('clients').select('*').eq('is_archived', false).order('name'),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').single(),
    supabase.from('board_cards').select('client_id'),
  ]);

  const cardCounts = new Map<string, number>();
  for (const card of cards ?? []) {
    cardCounts.set(card.client_id, (cardCounts.get(card.client_id) ?? 0) + 1);
  }

  return (
    <ClientList
      clients={(clients ?? []).map((c) => ({ ...c, card_count: cardCounts.get(c.id) ?? 0 }))}
      canManage={profile?.role === 'admin' || profile?.role === 'manager'}
    />
  );
}
