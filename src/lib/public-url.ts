import type { NextRequest } from 'next/server';

/**
 * The origin to build absolute redirects from.
 *
 * `new URL(request.url).origin` is wrong behind a reverse proxy: the app sees the
 * address it is bound to inside the container (http://0.0.0.0:3000), not the address
 * the browser used. Sending a user there ends the sign-in flow on a dead link.
 *
 * Preference order:
 *  1. An explicitly configured public URL. Roar injects APP_PUBLIC_URL / APP_URL;
 *     APP_ORIGIN is the generic escape hatch for other hosts. Trustworthy, because
 *     it comes from the platform rather than the request.
 *  2. The X-Forwarded-* headers the proxy sets.
 *  3. The request's own origin, which is correct when nothing sits in front.
 *
 * Note on 2: a client can forge X-Forwarded-Host when no proxy overwrites it, which
 * would turn an absolute redirect into an open redirect. That is why an explicitly
 * configured origin wins over the header, and why setting one is worth doing.
 */
export function publicOrigin(request: NextRequest): string {
  const configured =
    process.env.APP_PUBLIC_URL || process.env.APP_URL || process.env.APP_ORIGIN;

  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Misconfigured value: fall through rather than break sign-in entirely.
    }
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    // A comma-separated chain means several proxies; the first entry is the client-facing one.
    const host = forwardedHost.split(',')[0].trim();
    return `${proto.split(',')[0].trim()}://${host}`;
  }

  return new URL(request.url).origin;
}
