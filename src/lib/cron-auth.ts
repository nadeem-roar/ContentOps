import type { NextRequest } from 'next/server';

/**
 * Authorises a scheduled-worker call.
 *
 * Two schemes, because two schedulers exist and the app should not care which one is
 * driving it:
 *
 *   - `x-roar-cron-secret: <ROAR_CRON_SECRET>` — Roar AI Cloud's scheduled jobs, where
 *     the platform injects the secret and sets the header itself.
 *   - `Authorization: Bearer <CRON_SECRET>` — everything else: Vercel Cron, the pg_cron
 *     schedule in supabase/optional, curl during testing.
 *
 * Either is sufficient. Comparison is length-safe but not constant-time; these are
 * high-entropy secrets over TLS, so a timing oracle is not the weak link.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const roarSecret = process.env.ROAR_CRON_SECRET;
  const bearerSecret = process.env.CRON_SECRET;

  if (roarSecret) {
    const header = request.headers.get('x-roar-cron-secret');
    if (header && header === roarSecret) return true;
  }

  if (bearerSecret) {
    const header = request.headers.get('authorization');
    if (header && header === `Bearer ${bearerSecret}`) return true;
  }

  return false;
}
