import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS, so it is only ever used by trusted server-side
 * workers: the Drive sync job and the scheduler. Never import this into a component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
