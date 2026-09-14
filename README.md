# ContentOps

Content planning through to execution in one place: an automated kanban board, a shared
inbox that lives on the work itself, campaign planning, a content calendar, and approved
creatives that land in Google Drive without anyone dragging a file.

## How it hangs together

```
Idea ──► Briefing ──► Copywriting ──► Design ──► Review ──► Approved ──► Scheduled ──► Published
                                                              │              │
                                                              │              └─► scheduler cron
                                                              │                  advances the card
                                                              └─► marks latest creative final
                                                                  ──► drive-sync cron uploads to
                                                                      /Client/Campaign/Final/
```

Every arrow is a rule in the `automations` table, not hard-coded logic. The engine that
reads them is `src/lib/automations/engine.ts`; it is a pure function, so the rules are
covered by unit tests rather than by clicking through the UI.

### What the automations do out of the box

| Rule | Effect |
| --- | --- |
| Route work to the right desk | On entering a column, assigns the least-loaded person in that column's role and sets a due date two business days out. Never reassigns work someone already holds. |
| Design needs a brief | Blocks the move into Design until the caption is filled in. |
| Review needs a creative | Blocks the move into Review until a creative is uploaded. |
| Approved creatives go to Drive | Marks the highest version final and queues the Drive upload. |
| Nothing gets scheduled without a slot | Blocks the move into Scheduled until a publish date and time exist. |
| Publish on the slot | When the publish time arrives, the card moves to Published. |

A blocked move applies nothing at all — the card stays put and the person is told why.
Half-applied moves are the mess this tool exists to prevent.

### Drive naming

Files land as `client_campaign_channel-format_date_vN.ext`, for example
`acme-coffee-co_spring-launch_instagram-carousel_2026-10-02_v3.png`. Versioning is
assigned by the database, so nobody types "final_v2_FINAL".

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

Create the project in the **company Supabase account**, then:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

That applies `supabase/migrations/` in order: schema, RLS, seeded board and automations,
RPCs, and the board read model.

Enable Google as an auth provider in the Supabase dashboard and set the redirect URL to
`https://YOUR_APP/auth/callback`.

Then pin the allowed sign-in domain so the database trigger rejects outside accounts:

```sql
alter database postgres set app.allowed_email_domains = 'creatorflow.com.au';
```

The first person to sign in becomes `admin`; everyone after starts as `viewer` and is
promoted from the profiles table.

### 3. Google Drive

In the **company GCP project**: create a service account, enable the Drive API, and grant
it domain-wide delegation for `https://www.googleapis.com/auth/drive`. Share the target
shared drive (or root folder) with the service account, and put the folder ID in
`GOOGLE_DRIVE_ROOT_FOLDER_ID`.

### 4. Environment

```bash
cp .env.example .env.local
```

Fill it in. `SUPABASE_SERVICE_ROLE_KEY` and the Google private key are server-only — they
belong in Vercel's environment variables, never in the repo.

### 5. Run

```bash
npm run dev
```

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm test           # automation engine + Drive naming tests
npm run db:types   # regenerate database types from the linked project
```

## Deployment

Host this only on company-controlled infrastructure — it holds client content and creative
assets. Personal Vercel, Netlify, Replit, and free-tier hosts are out.

Two things must be true wherever it runs: the app is served, and the two background
workers are triggered on a schedule. The workers are not optional — without them approved
creatives never reach Drive and scheduled cards never advance.

| Endpoint | Cadence | Does |
| --- | --- | --- |
| `/api/cron/drive-sync` | every 5 min | Uploads approved creatives to Drive |
| `/api/cron/scheduler` | every 10 min | Advances cards whose publish slot has arrived |

Both authenticate with `Authorization: Bearer $CRON_SECRET` and are excluded from the auth
middleware. Set `CRON_SECRET` before the first deploy, or both return 401.

### Container (self-hosted platforms)

```bash
docker build -t contentops \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY \
  --build-arg NEXT_PUBLIC_APP_URL=https://YOUR_APP .
```

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so they are build
args and changing them means rebuilding. Every other variable — service-role key, Google
credentials, `CRON_SECRET` — is read at runtime and must be injected as a secret, never
baked into the image.

The container listens on `3000` and serves an unauthenticated liveness probe at
`/api/health`. Point the platform's health check there.

For the schedule, either use the platform's own cron, or run it from Postgres by applying
`supabase/optional/scheduled_jobs.sql` — that uses `pg_cron` + `pg_net` to call the two
endpoints, so the workers keep running regardless of where the app is hosted. Read the
header of that file first; it needs two database settings, and applying it **on Vercel
would double-fire** the jobs that `vercel.json` already registers.

### Vercel

`vercel.json` registers both cron jobs; deploy as-is and do not apply the optional SQL.

## Layout

```
src/
  app/
    (app)/          board, calendar, campaigns, inbox — everything behind auth
    actions/        server actions: card moves, comments, asset uploads
    api/cron/       drive-sync and scheduler workers
    auth/           OAuth callback with domain enforcement
  components/       board, calendar, inbox, and UI primitives
  lib/
    automations/    the rules engine (pure) and its effect applier
    drive/          Drive client, filename convention, sync worker
    supabase/       browser, server, and service-role clients
supabase/migrations/
```

## Notes on data handling

- Client names, creative assets, and campaign detail are confidential. They stay in the
  company Supabase project, the company Drive, and the company Vercel account.
- RLS is on for every table. The service-role key bypasses it and is used only by the two
  cron workers.
- Storage objects are private; the bucket has no public read policy.
