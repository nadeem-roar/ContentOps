'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Inbox, LayoutGrid, Megaphone, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/types';

const LINKS = [
  { href: '/board', label: 'Board', icon: LayoutGrid },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
] as const;

export function Nav({ profile, unreadCount }: { profile: Profile; unreadCount: number }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center gap-6 px-4">
        <Link href="/board" className="text-sm font-semibold tracking-tight">
          ContentOps
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-secondary font-medium text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {href === '/inbox' && unreadCount > 0 ? (
                  <span
                    className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
                    aria-label={`${unreadCount} unread`}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Avatar name={profile.full_name ?? profile.email} src={profile.avatar_url} />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile.full_name ?? profile.email}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
