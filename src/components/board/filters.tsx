'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BoardFilters({
  clients,
  active,
  onChange,
}: {
  clients: { id: string; name: string; slug: string }[];
  active: { client?: string; mine?: string };
  onChange: (key: string, value: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
      <Button
        size="sm"
        variant={active.mine === '1' ? 'default' : 'outline'}
        onClick={() => onChange('mine', active.mine === '1' ? null : '1')}
      >
        My cards
      </Button>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      <Button
        size="sm"
        variant={!active.client ? 'secondary' : 'ghost'}
        onClick={() => onChange('client', null)}
      >
        All clients
      </Button>

      {clients.map((client) => (
        <Button
          key={client.id}
          size="sm"
          variant={active.client === client.slug ? 'secondary' : 'ghost'}
          onClick={() => onChange('client', client.slug)}
          className={cn(active.client === client.slug && 'font-medium')}
        >
          {client.name}
        </Button>
      ))}
    </div>
  );
}
