import { describe, expect, it } from 'vitest';
import { driveFileName, fileExtension, slugify } from './naming';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Acme Coffee Co.')).toBe('acme-coffee-co');
  });

  it('collapses runs of punctuation and trims the edges', () => {
    expect(slugify('  ***Spring // Launch!!  ')).toBe('spring-launch');
  });

  it('caps length so Drive names stay readable', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(60);
  });
});

describe('fileExtension', () => {
  it('prefers the extension on the original filename', () => {
    expect(fileExtension('hero.PNG', 'image/jpeg')).toBe('png');
  });

  it('falls back to the mime type when the name has none', () => {
    expect(fileExtension('hero', 'video/quicktime')).toBe('mov');
  });

  it('falls back to bin for an unknown type', () => {
    expect(fileExtension('hero', 'application/x-unknown')).toBe('bin');
  });
});

describe('driveFileName', () => {
  const base = {
    clientName: 'Acme Coffee Co.',
    campaignName: 'Spring Launch',
    channel: 'instagram',
    format: 'carousel',
    scheduledFor: '2026-10-02T09:30:00Z',
    version: 3,
    originalFileName: 'final-artwork.png',
    mimeType: 'image/png',
  };

  it('builds the full convention', () => {
    expect(driveFileName(base)).toBe(
      'acme-coffee-co_spring-launch_instagram-carousel_2026-10-02_v3.png',
    );
  });

  it('marks unscheduled work rather than inventing a date', () => {
    expect(driveFileName({ ...base, scheduledFor: null })).toContain('_unscheduled_v3.png');
  });

  it('files campaign-less cards under unassigned', () => {
    expect(driveFileName({ ...base, campaignName: null })).toContain('_unassigned_');
  });
});
