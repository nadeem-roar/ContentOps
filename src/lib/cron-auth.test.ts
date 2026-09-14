import { afterEach, describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { isAuthorizedCron } from './cron-auth';

/** Minimal stand-in: isAuthorizedCron only ever reads headers. */
const req = (headers: Record<string, string>) =>
  ({
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  }) as unknown as NextRequest;

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('isAuthorizedCron', () => {
  it('accepts Roar’s header when ROAR_CRON_SECRET is set', () => {
    process.env.ROAR_CRON_SECRET = 'roar-secret';
    delete process.env.CRON_SECRET;

    expect(isAuthorizedCron(req({ 'x-roar-cron-secret': 'roar-secret' }))).toBe(true);
    expect(isAuthorizedCron(req({ 'x-roar-cron-secret': 'wrong' }))).toBe(false);
  });

  it('accepts a bearer token when CRON_SECRET is set', () => {
    delete process.env.ROAR_CRON_SECRET;
    process.env.CRON_SECRET = 'bearer-secret';

    expect(isAuthorizedCron(req({ authorization: 'Bearer bearer-secret' }))).toBe(true);
    expect(isAuthorizedCron(req({ authorization: 'Bearer wrong' }))).toBe(false);
  });

  it('accepts either scheme when both secrets are configured', () => {
    process.env.ROAR_CRON_SECRET = 'roar-secret';
    process.env.CRON_SECRET = 'bearer-secret';

    expect(isAuthorizedCron(req({ 'x-roar-cron-secret': 'roar-secret' }))).toBe(true);
    expect(isAuthorizedCron(req({ authorization: 'Bearer bearer-secret' }))).toBe(true);
  });

  it('refuses a request carrying no credentials', () => {
    process.env.ROAR_CRON_SECRET = 'roar-secret';
    process.env.CRON_SECRET = 'bearer-secret';

    expect(isAuthorizedCron(req({}))).toBe(false);
  });

  // The dangerous case: with no secret configured, an empty header must not match an
  // empty expectation and wave every caller through.
  it('refuses everything when neither secret is configured', () => {
    delete process.env.ROAR_CRON_SECRET;
    delete process.env.CRON_SECRET;

    expect(isAuthorizedCron(req({}))).toBe(false);
    expect(isAuthorizedCron(req({ 'x-roar-cron-secret': '' }))).toBe(false);
    expect(isAuthorizedCron(req({ authorization: 'Bearer ' }))).toBe(false);
  });
});
