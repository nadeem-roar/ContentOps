import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { NewCampaignDialog } from '@/components/new-campaign-dialog';
import type { CampaignStatus, StageType } from '@/lib/types';

export const metadata = { title: 'Campaigns · ContentOps' };

const STATUS_VARIANT: Record<CampaignStatus, 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  draft: 'outline',
  active: 'success',
  paused: 'warning',
  completed: 'secondary',
  archived: 'outline',
};

/** The stages a campaign's progress bar is built from, in order. */
const PROGRESS_STAGES: StageType[] = ['backlog', 'brief', 'production', 'review', 'approved', 'scheduled', 'published'];

export default async function CampaignsPage() {
  const supabase = await createClient();

  const [{ data: campaigns }, { data: cards }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*, client:clients ( id, name, brand_color )')
      .neq('status', 'archived')
      .order('start_date', { ascending: false, nullsFirst: false }),
    supabase.from('board_cards').select('campaign_id, column_id'),
  ]);

  const [{ data: columns }, { data: clientOptions }] = await Promise.all([
    supabase.from('board_columns').select('id, stage'),
    supabase.from('clients').select('id, name').eq('is_archived', false).order('name'),
  ]);
  const stageOf = new Map((columns ?? []).map((c) => [c.id, c.stage as StageType]));

  const progress = new Map<string, Map<StageType, number>>();
  for (const card of cards ?? []) {
    if (!card.campaign_id) continue;
    const stage = stageOf.get(card.column_id);
    if (!stage) continue;

    const counts = progress.get(card.campaign_id) ?? new Map<StageType, number>();
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
    progress.set(card.campaign_id, counts);
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Campaigns</h1>
        <NewCampaignDialog clients={clientOptions ?? []} />
      </header>

      {(campaigns ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No campaigns yet.
        </p>
      ) : null}

      <ul className="space-y-3">
        {(campaigns ?? []).map((campaign: any) => {
          const counts = progress.get(campaign.id) ?? new Map<StageType, number>();
          const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
          const published = counts.get('published') ?? 0;

          return (
            <li key={campaign.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/board?campaign=${campaign.id}`}
                  className="font-medium hover:underline"
                >
                  {campaign.name}
                </Link>

                <Badge
                  variant="outline"
                  style={
                    campaign.client?.brand_color
                      ? {
                          borderColor: campaign.client.brand_color,
                          color: campaign.client.brand_color,
                        }
                      : undefined
                  }
                >
                  {campaign.client?.name}
                </Badge>

                <Badge variant={STATUS_VARIANT[campaign.status as CampaignStatus]}>
                  {campaign.status}
                </Badge>

                <span className="ml-auto text-xs text-muted-foreground">
                  {campaign.start_date ? format(parseISO(campaign.start_date), 'd MMM') : '—'}
                  {' → '}
                  {campaign.end_date ? format(parseISO(campaign.end_date), 'd MMM yyyy') : '—'}
                </span>
              </div>

              {campaign.objective ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{campaign.objective}</p>
              ) : null}

              <div className="mt-3">
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  {PROGRESS_STAGES.map((stage) => {
                    const count = counts.get(stage) ?? 0;
                    if (count === 0 || total === 0) return null;

                    return (
                      <div
                        key={stage}
                        title={`${stage}: ${count}`}
                        style={{ width: `${(count / total) * 100}%` }}
                        className={
                          stage === 'published'
                            ? 'bg-emerald-500'
                            : stage === 'scheduled' || stage === 'approved'
                              ? 'bg-primary'
                              : 'bg-muted-foreground/40'
                        }
                      />
                    );
                  })}
                </div>

                <p className="mt-1.5 text-xs text-muted-foreground">
                  {total === 0
                    ? 'No content planned yet.'
                    : `${published} of ${total} published`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
