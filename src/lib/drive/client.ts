import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

let cached: drive_v3.Drive | null = null;

/**
 * Drive client backed by the company service account. Domain-wide delegation lets it
 * act as an ops user so files land with sane ownership inside the shared drive rather
 * than being owned by a service account nobody can find.
 */
export function getDrive(): drive_v3.Drive {
  if (cached) return cached;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      'Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
    );
  }

  const auth = new google.auth.JWT({
    email,
    // Vercel stores the key with literal \n sequences.
    key: rawKey.replace(/\\n/g, '\n'),
    scopes: SCOPES,
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE_USER || undefined,
  });

  cached = google.drive({ version: 'v3', auth });
  return cached;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Drive query strings take single quotes; escape any in a folder name. */
function escapeForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Finds a child folder by name, creating it if absent. Idempotent, so replaying a sync
 * never produces a second "Q4 Launch" folder next to the first.
 */
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const drive = getDrive();
  const safeName = escapeForQuery(name);

  const existing = await drive.files.list({
    q: `name = '${safeName}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const found = existing.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`Drive did not return an id for folder "${name}"`);
  }

  return created.data.id;
}

/**
 * Builds (or reuses) the folder path a finished creative belongs in:
 *   <root>/<Client>/<Campaign>/Final
 * Cards with no campaign land under an "Unassigned" campaign folder so nothing is
 * silently dropped at the client root.
 */
export async function ensureCampaignFolder(
  clientName: string,
  campaignName: string | null,
): Promise<{ clientFolderId: string; campaignFolderId: string; finalFolderId: string }> {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not set');

  const clientFolderId = await ensureFolder(clientName, root);
  const campaignFolderId = await ensureFolder(campaignName || 'Unassigned', clientFolderId);
  const finalFolderId = await ensureFolder('Final', campaignFolderId);

  return { clientFolderId, campaignFolderId, finalFolderId };
}

export interface UploadResult {
  fileId: string;
  webViewLink: string;
}

export async function uploadFile(params: {
  name: string;
  mimeType: string;
  parentId: string;
  body: Buffer;
}): Promise<UploadResult> {
  const drive = getDrive();

  const created = await drive.files.create({
    requestBody: { name: params.name, parents: [params.parentId] },
    media: { mimeType: params.mimeType, body: Readable.from(params.body) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`Drive upload of "${params.name}" returned no file id`);
  }

  return {
    fileId: created.data.id,
    webViewLink:
      created.data.webViewLink ?? `https://drive.google.com/file/d/${created.data.id}/view`,
  };
}
