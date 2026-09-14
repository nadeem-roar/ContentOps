'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function LoginButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);

    const supabase = createClient();
    const redirectTo = new URL('/auth/callback', window.location.origin);
    if (next) redirectTo.searchParams.set('next', next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });

    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={signIn} disabled={pending} className="w-full">
        {pending ? 'Redirecting…' : 'Continue with Google'}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
