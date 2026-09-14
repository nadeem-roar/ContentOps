export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function fileExtension(fileName: string, mimeType?: string | null): string {
  const fromName = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;

  const fromMime: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
  };

  return fromMime[mimeType ?? ''] ?? 'bin';
}

export interface DriveNameParts {
  clientName: string;
  campaignName: string | null;
  channel: string;
  format: string;
  scheduledFor: string | null;
  version: number;
  originalFileName: string;
  mimeType?: string | null;
}

/**
 * The one filename convention. Everything a person needs to identify a creative in a
 * Drive folder, in an order that sorts usefully:
 *   client_campaign_channel-format_2026-10-02_v3.png
 *
 * Cards with no publish slot use "unscheduled" rather than today's date, so a filename
 * never implies a date that was never agreed.
 */
export function driveFileName(parts: DriveNameParts): string {
  const date = parts.scheduledFor ? parts.scheduledFor.slice(0, 10) : 'unscheduled';

  const segments = [
    slugify(parts.clientName),
    slugify(parts.campaignName || 'unassigned'),
    `${slugify(parts.channel)}-${slugify(parts.format)}`,
    date,
    `v${parts.version}`,
  ];

  return `${segments.join('_')}.${fileExtension(parts.originalFileName, parts.mimeType)}`;
}
