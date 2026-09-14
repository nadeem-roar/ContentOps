'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { addCampaign } from '@/app/actions/entities';
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
  selectClass,
} from '@/components/ui/dialog';

export function NewCampaignDialog({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  function submit() {
    if (!name.trim() || !clientId) {
      setError('A name and a client are required.');
      return;
    }

    startTransition(async () => {
      const result = await addCampaign({
        client_id: clientId,
        name,
        objective,
        start_date: startDate,
        end_date: endDate,
      });

      if (!result.ok) {
        setError(result.error ?? 'Could not create the campaign.');
        return;
      }

      setName('');
      setObjective('');
      setStartDate('');
      setEndDate('');
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  if (clients.length === 0) {
    return (
      <Button size="sm" variant="outline" className="ml-auto" asChild>
        <a href="/clients">Add a client first</a>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="ml-auto">
          <Plus className="h-4 w-4" />
          New campaign
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Cards filed under it are grouped in Drive under a folder of this name.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label="Client">
            <select
              className={selectClass}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Choose…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Black Friday 2026"
            />
          </Field>

          <Field label="Objective" hint="Optional. What this campaign is for.">
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="min-h-[60px]"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Ends">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Creating…' : 'Create campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
