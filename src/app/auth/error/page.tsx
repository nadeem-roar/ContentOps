const REASONS: Record<string, string> = {
  domain: 'That Google account is outside the company domain. Sign in with your work account.',
  deactivated: 'This account has been deactivated. Ask an admin to reactivate it.',
  missing_code: 'The sign-in link was incomplete. Try again.',
  exchange_failed: 'We could not complete sign-in. Try again.',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Sign-in failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {REASONS[reason ?? ''] ?? 'Something went wrong signing you in.'}
        </p>
        <a href="/login" className="mt-6 inline-block text-sm font-medium underline">
          Back to sign in
        </a>
      </div>
    </main>
  );
}
