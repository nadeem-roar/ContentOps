import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fileApprovedAssets } from '@/lib/drive/filing';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Files approved creatives into their campaign's Final folder in Drive.
 *
 * Runs on a schedule and is also safe to trigger by hand, so the usual experience is
 * "approve, and it is filed within the minute" while the timer catches anything that
 * failed.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const outcomes = await fileApprovedAssets(createAdminClient());

    return NextResponse.json({
      processed: outcomes.length,
      filed: outcomes.filter((o) => o.status === 'filed').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      skipped: outcomes.filter((o) => o.status === 'skipped').length,
      outcomes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Filing run failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Both Vercel Cron and Roar scheduled jobs issue GET.
export const GET = POST;
