import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the container platform. Deliberately does not touch Supabase
 * or Drive: a database blip should not cause the orchestrator to kill and restart
 * otherwise-healthy web containers.
 */
export function GET() {
  return NextResponse.json({ status: 'ok', at: new Date().toISOString() });
}
