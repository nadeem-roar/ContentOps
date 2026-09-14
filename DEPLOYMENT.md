# Deployment state

Where ContentOps actually runs, as of 2026-09-14. No secrets here — IDs and URLs only.

## Live

| | |
| --- | --- |
| App | https://contentops-acd1.roarai.app |
| Host | Roar AI Cloud, org "Creator Flow", project ContentOps, region `sg` |
| App id | `d93c1485-7385-4864-93cb-ba77992bfef6` |
| Build | From this repo's Dockerfile (`framework: user-dockerfile`) |
| Deploys | Automatically on push to `main` |
| Repo | github.com/nadeem-roar/ContentOps (private) |

| | |
| --- | --- |
| Database | Supabase project `titpmpvwckvpfbiwtvyc`, region `ap-southeast-1` |
| URL | https://titpmpvwckvpfbiwtvyc.supabase.co |
| Org | `lagqxxowrsxljkutmrmg` |
| Plan | Free. Metadata only, so the 500 MB limit is not a concern |
| Migrations | 0001–0006 applied |

| | |
| --- | --- |
| Drive | Shared Drive `0AI4-XMLJ0vhlUk9PVA` ("ContentOps Creatives") |
| Auth | OAuth refresh token, not a service account key |
| GCP project | `contentops-508611` |
| OAuth client | `1092622780428-jf1ehrph9vll0l5ishke1825l9s2r681.apps.googleusercontent.com` |

The service account route was abandoned: the organisation enforces
`iam.disableServiceAccountKeyCreation`, so no JSON key can be downloaded. The code still
supports that path for anyone deploying under an org that permits it.

## Secrets set on the app

Nine, by name only:

```
NEXT_PUBLIC_SUPABASE_URL      NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     ALLOWED_EMAIL_DOMAINS
GOOGLE_OAUTH_CLIENT_ID        GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN    GOOGLE_DRIVE_ROOT_FOLDER_ID
CRON_SECRET
```

Roar's build settings still report `GOOGLE_SERVICE_ACCOUNT_*` and
`GOOGLE_DRIVE_IMPERSONATE_USER` as missing. That is a stale read of `.env.example`, which
documents the service-account route as an alternative. Nothing is wrong.

## Redirect URLs registered

Sign-in breaks if any of these is removed.

- Supabase Site URL: `https://contentops-acd1.roarai.app`
- Supabase redirect allowlist: `https://contentops-acd1.roarai.app/auth/callback`
- Google OAuth client: `https://contentops-acd1.roarai.app/auth/callback`,
  `https://titpmpvwckvpfbiwtvyc.supabase.co/auth/v1/callback`, `http://localhost:53682/`

## Scheduled jobs

Both registered and verified returning 200.

| Job | Path | Schedule | Id |
| --- | --- | --- | --- |
| File approved creatives | `/api/cron/file-creatives` | `*/5 * * * *` | `ec66702e-9458-49cc-ba40-771d69c1f64b` |
| Publish scheduler | `/api/cron/scheduler` | `*/10 * * * *` | `0d21d16a-19ea-403e-91c8-5faf824f6116` |

**Redeploy after creating or changing a job.** Roar injects `ROAR_CRON_SECRET` into the
container at deploy time, so a job created after the last deploy authenticates against a
variable the running process does not have, and every run returns 401 while the console
shows the job as scheduled. Both jobs failed exactly this way until a redeploy; nothing in
the app needed changing.

`list_env_vars` does not show `ROAR_CRON_SECRET` even when it is present, so it is not a
reliable check. Run a job and read the HTTP status instead.

## Still to do

1. **End-to-end test**: client → campaign → card → upload → drag to Approved, then confirm
   the file lands in `ContentOps Creatives/<Client>/<Campaign>/Final/` renamed to the
   convention.
2. **Delete the unused Supabase project** `tzcyzuxoxjbvkaleksny` (Sydney). Empty, replaced
   by the Singapore one.

## Open questions

- GitHub and Supabase both sit in personally-named accounts rather than company orgs. Roar
  is the only company-owned piece. Worth moving before this holds much real client data.
- The publish scheduler advances the board to Published; it does not post to any platform.
  Wiring a real publisher means adding one action type to the automation engine.
