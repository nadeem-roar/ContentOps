import { LoginButton } from './login-button';

export const metadata = { title: 'Sign in · ContentOps' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">ContentOps</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Plan it, make it, ship it. Sign in with your work Google account.
        </p>
        <div className="mt-6">
          <LoginButton next={next} />
        </div>
      </div>
    </main>
  );
}
