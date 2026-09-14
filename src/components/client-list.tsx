'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { addClient } from '@/app/actions/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
} from '@/components/ui/dialog';

interface ClientRow {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  notes: string | null;
  card_count: number;
}

export function ClientList({
  clients,
  canManage,
}: {
  clients: ClientRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [brandColor, setBrandColor] = useState('#2563eb');
  const [notes, setNotes] = useState('');

  function submit() {
    if (!name.trim()) {
      setError('A name is required.');
      return;
    }

    startTransition(async () => {
      const result = await addClient({ name, brand_color: brandColor, notes });

      if (!result.ok) {
        setError(result.error ?? 'Could not add the client.');
        return;
      }

      setName('');
      setNotes('');
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Clients</h1>

        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="ml-auto">
                <Plus className="h-4 w-4" />
                New client
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>New client</DialogTitle>
                <DialogDescription>
                  A folder of this name is created in Drive the first time a creative is
                  uploaded for them.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <Field label="Name">
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Coffee Co."
                  />
                </Field>

                <Field label="Brand colour" hint="Used to tint their cards on the board.">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded-md border border-input bg-background"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </Field>

                <Field label="Notes" hint="Optional.">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[60px]"
                  />
                </Field>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={pending}>
                  {pending ? 'Adding…' : 'Add client'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No clients yet.{' '}
          {canManage
            ? 'Add one to start planning work.'
            : 'Ask an admin or manager to add one.'}
        </p>
      ) : null}

      <ul className="space-y-2">
        {clients.map((client) => (
          <li
            key={client.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 shadow-sm"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: client.brand_color ?? 'hsl(var(--muted-foreground))' }}
              aria-hidden
            />

            <Link href={`/board?client=${client.slug}`} className="font-medium hover:underline">
              {client.name}
            </Link>

            <Badge variant="secondary">
              {client.card_count} {client.card_count === 1 ? 'card' : 'cards'}
            </Badge>

            {client.notes ? (
              <span className="w-full text-sm text-muted-foreground">{client.notes}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
