import { afterEach, describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { publicOrigin } from './public-url';

const req = (url: string, headers: Record<string, string> = {}) =>
  ({
    url,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  }) as unknown as NextRequest;

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

function clearConfigured() {
  delete process.env.APP_PUBLIC_URL;
  delete process.env.APP_URL;
  delete process.env.APP_ORIGIN;
}

describe('publicOrigin', () => {
  // The bug this exists to prevent: behind a proxy the request URL is the container's
  // own bind address, and redirecting a user there ends sign-in on a dead link.
  it('never returns the internal bind address when a proxy header is present', () => {
    clearConfigured();

    const origin = publicOrigin(
      req('http://0.0.0.0:3000/auth/callback?code=abc', {
        'x-forwarded-host': 'contentops-acd1.roarai.app',
        'x-forwarded-proto': 'https',
      }),
    );

    expect(origin).toBe('https://contentops-acd1.roarai.app');
  });

  it('prefers a configured public URL over the forwarded header', () => {
    clearConfigured();
    process.env.APP_PUBLIC_URL = 'https://configured.example';

    const origin = publicOrigin(
      req('http://0.0.0.0:3000/auth/callback', { 'x-forwarded-host': 'spoofed.example' }),
    );

    expect(origin).toBe('https://configured.example');
  });

  it('strips any path from a configured URL', () => {
    clearConfigured();
    process.env.APP_URL = 'https://app.example/some/path';

    expect(publicOrigin(req('http://0.0.0.0:3000/'))).toBe('https://app.example');
  });

  it('ignores a malformed configured URL rather than breaking sign-in', () => {
    clearConfigured();
    process.env.APP_PUBLIC_URL = 'not a url';

    const origin = publicOrigin(
      req('http://0.0.0.0:3000/', { 'x-forwarded-host': 'fallback.example' }),
    );

    expect(origin).toBe('https://fallback.example');
  });

  it('takes the client-facing entry from a proxy chain', () => {
    clearConfigured();

    const origin = publicOrigin(
      req('http://0.0.0.0:3000/', {
        'x-forwarded-host': 'outer.example, inner.internal',
        'x-forwarded-proto': 'https, http',
      }),
    );

    expect(origin).toBe('https://outer.example');
  });

  it('assumes https when the proxy sends a host but no protocol', () => {
    clearConfigured();

    expect(publicOrigin(req('http://0.0.0.0:3000/', { 'x-forwarded-host': 'app.example' }))).toBe(
      'https://app.example',
    );
  });

  it('falls back to the request origin when nothing sits in front', () => {
    clearConfigured();

    expect(publicOrigin(req('http://localhost:3000/auth/callback'))).toBe('http://localhost:3000');
  });
});
