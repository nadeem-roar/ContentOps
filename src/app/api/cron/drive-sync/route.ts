import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncPendingAssets } from '@/lib/drive/sync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Pushes approved creatives into the client Drive folders.
 *
 * Runs on a schedule (see vercel.json) and is also pinged right after a card is approved,
 * so the usual experience is "approve, and it is in Drive seconds later" while the timer
 * catches anything that failed.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const outcomes = await syncPendingAssets(createAdminClient());

    return NextResponse.json({
      processed: outcomes.length,
      uploaded: outcomes.filter((o) => o.status === 'uploaded').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      skipped: outcomes.filter((o) => o.status === 'skipped').length,
      outcomes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel Cron issues GET requests.
export const GET = POST;
