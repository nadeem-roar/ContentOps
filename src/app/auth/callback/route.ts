import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? 'creatorflow.com.au')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/board';

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`);
  }

  // Belt and braces: the database trigger enforces this too, but refusing here means
  // an out-of-domain account never gets a session cookie in the first place.
  const domain = data.user.email.split('@')[1]?.toLowerCase();
  if (!domain || !allowedDomains().includes(domain)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=domain`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', data.user.id)
    .single();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=deactivated`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/board'}`);
}
