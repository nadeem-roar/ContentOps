-- ContentOps :: scheduled workers, driven from Postgres
--
-- OPTIONAL. Apply this only when ContentOps is hosted somewhere WITHOUT its own cron
-- scheduler. On Vercel, vercel.json already registers both jobs and applying this as
-- well would double-fire them.
--
-- Running the schedule from Postgres rather than the host keeps the workers working no
-- matter where the app is deployed, which is the whole point on a self-hosted platform.
--
-- Before applying, set the two settings the jobs read (they are not in the migration so
-- the secret never lands in version control):
--
--   alter database postgres set app.base_url    = 'https://contentops.roar-ai.com';
--   alter database postgres set app.cron_secret = 'the value of CRON_SECRET';
--
-- Both must match the deployed app exactly, or every call comes back 401.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Fires one worker endpoint. Async: pg_net queues the request and returns immediately,
-- so a slow Drive upload never holds a cron worker open.
create or replace function call_worker(path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base   text := current_setting('app.base_url', true);
  secret text := current_setting('app.cron_secret', true);
begin
  if base is null or secret is null then
    raise warning 'call_worker(%): app.base_url or app.cron_secret is not set; skipping', path;
    return;
  end if;

  perform net.http_post(
    url     := base || path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function call_worker(text) from public;

-- Uploads approved creatives into the client Drive folders.
select cron.schedule(
  'contentops-drive-sync',
  '*/5 * * * *',
  $$select call_worker('/api/cron/drive-sync')$$
);

-- Advances cards whose publish slot has arrived.
select cron.schedule(
  'contentops-scheduler',
  '*/10 * * * *',
  $$select call_worker('/api/cron/scheduler')$$
);

-- Inspect runs with:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--
-- Remove with:
--   select cron.unschedule('contentops-drive-sync');
--   select cron.unschedule('contentops-scheduler');
