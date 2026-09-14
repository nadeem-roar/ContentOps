import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: unread }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.rpc('my_unread_count'),
  ]);

  if (!profile?.is_active) redirect('/auth/error?reason=deactivated');

  return (
    <div className="flex min-h-screen flex-col">
      <Nav profile={profile} unreadCount={typeof unread === 'number' ? unread : 0} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
