'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { addCard } from '@/app/actions/entities';
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

const CHANNELS = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
  'x',
  'blog',
  'email',
  'other',
];

const FORMATS = ['static', 'carousel', 'reel', 'story', 'video', 'article', 'email', 'other'];

export function NewCardDialog({
  clients,
  campaigns,
}: {
  clients: { id: string; name: string }[];
  campaigns: { id: string; name: string; client_id: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [channel, setChannel] = useState('instagram');
  const [format, setFormat] = useState('static');
  const [priority, setPriority] = useState('normal');
  const [hook, setHook] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Only campaigns belonging to the chosen client, so you cannot file work under
  // another client's campaign by accident.
  const availableCampaigns = useMemo(
    () => campaigns.filter((c) => c.client_id === clientId),
    [campaigns, clientId],
  );

  function reset() {
    setTitle('');
    setCampaignId('');
    setHook('');
    setDueDate('');
    setError(null);
  }

  function submit() {
    if (!title.trim() || !clientId) {
      setError('A title and a client are required.');
      return;
    }

    startTransition(async () => {
      const result = await addCard({
        title,
        client_id: clientId,
        campaign_id: campaignId,
        channel: channel as never,
        format: format as never,
        priority: priority as never,
        hook,
        due_date: dueDate,
      });

      if (!result.ok) {
        setError(result.error ?? 'Could not create the card.');
        return;
      }

      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (clients.length === 0) {
    return (
      <Button size="sm" variant="outline" asChild>
        <a href="/clients">Add a client first</a>
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New card
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New card</DialogTitle>
          <DialogDescription>
            It starts in the first column. Copy and creatives get added as it moves.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label="Title">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Black Friday teaser"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client">
              <select
                className={selectClass}
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setCampaignId('');
                }}
              >
                <option value="">Choose…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Campaign"
              hint={
                clientId && availableCampaigns.length === 0
                  ? 'No campaigns for this client yet.'
                  : undefined
              }
            >
              <select
                className={selectClass}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                disabled={!clientId || availableCampaigns.length === 0}
              >
                <option value="">None</option>
                {availableCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Channel">
              <select
                className={selectClass}
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Format">
              <select
                className={selectClass}
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Priority">
              <select
                className={selectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {['low', 'normal', 'high', 'urgent'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Hook" hint="Optional. The angle, in a line.">
            <Textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              className="min-h-[60px]"
            />
          </Field>

          <Field label="Due date" hint="Optional. Automation sets one if you leave it blank.">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Creating…' : 'Create card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
