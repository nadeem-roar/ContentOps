import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

let cached: drive_v3.Drive | null = null;

/**
 * Drive client, authenticated one of two ways.
 *
 * 1. OAuth refresh token (preferred). Works under the common org policy
 *    `iam.disableServiceAccountKeyCreation`, which forbids downloadable service account
 *    keys. A one-time consent by an ops user yields a refresh token; the library trades
 *    it for access tokens from then on. Get one with `npm run drive:token`.
 *
 * 2. Service account key. Simpler where the org allows key creation.
 *
 * OAuth wins when both are configured, because an org that set the policy meant it.
 */
export function getDrive(): drive_v3.Drive {
  if (cached) return cached;

  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
    const auth = new google.auth.OAuth2({ clientId, clientSecret });
    auth.setCredentials({ refresh_token: refreshToken });
    cached = google.drive({ version: 'v3', auth });
    return cached;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (email && rawKey) {
    const auth = new google.auth.JWT({
      email,
      // Hosts store the key with literal \n sequences.
      key: rawKey.replace(/\\n/g, '\n'),
      scopes: SCOPES,
      subject: process.env.GOOGLE_DRIVE_IMPERSONATE_USER || undefined,
    });

    cached = google.drive({ version: 'v3', auth });
    return cached;
  }

  throw new Error(
    'Google Drive is not configured. Set either GOOGLE_OAUTH_CLIENT_ID + ' +
      'GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN, or ' +
      'GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
  );
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
 * Builds (or reuses) the folder path for a campaign:
 *   <root>/<Client>/<Campaign>/{Working,Final}
 *
 * Uploads land in Working/ and are moved to Final/ on approval, so Drive mirrors the
 * board rather than only receiving the end result. Cards with no campaign land under an
 * "Unassigned" campaign folder so nothing is silently dropped at the client root.
 */
export async function ensureCampaignFolders(
  clientName: string,
  campaignName: string | null,
): Promise<{
  clientFolderId: string;
  campaignFolderId: string;
  workingFolderId: string;
  finalFolderId: string;
}> {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not set');

  const clientFolderId = await ensureFolder(clientName, root);
  const campaignFolderId = await ensureFolder(campaignName || 'Unassigned', clientFolderId);

  // Sequential, not parallel: both calls would otherwise race to create the parent.
  const workingFolderId = await ensureFolder('Working', campaignFolderId);
  const finalFolderId = await ensureFolder('Final', campaignFolderId);

  return { clientFolderId, campaignFolderId, workingFolderId, finalFolderId };
}

/**
 * Moves a file between folders and renames it in one call. Used to promote an approved
 * creative from Working/ to Final/ under the naming convention.
 */
export async function moveAndRename(params: {
  fileId: string;
  fromParentId: string | null;
  toParentId: string;
  name: string;
}): Promise<string> {
  const drive = getDrive();

  const updated = await drive.files.update({
    fileId: params.fileId,
    addParents: params.toParentId,
    removeParents: params.fromParentId ?? undefined,
    requestBody: { name: params.name },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  return (
    updated.data.webViewLink ?? `https://drive.google.com/file/d/${params.fileId}/view`
  );
}

/** Streams a file's bytes back out of Drive, for serving previews through the app. */
export async function downloadFile(fileId: string): Promise<{
  stream: NodeJS.ReadableStream;
  mimeType: string;
}> {
  const drive = getDrive();

  const meta = await drive.files.get({
    fileId,
    fields: 'mimeType',
    supportsAllDrives: true,
  });

  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );

  return {
    stream: res.data as unknown as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType ?? 'application/octet-stream',
  };
}

export interface UploadResult {
  fileId: string;
  webViewLink: string;
}

/**
 * Accepts a stream so a 500 MB video is never held in memory on its way to Drive.
 * A Buffer is still accepted for small, already-materialised payloads.
 */
export async function uploadFile(params: {
  name: string;
  mimeType: string;
  parentId: string;
  body: Buffer | NodeJS.ReadableStream;
}): Promise<UploadResult> {
  const drive = getDrive();

  const created = await drive.files.create({
    requestBody: { name: params.name, parents: [params.parentId] },
    media: {
      mimeType: params.mimeType,
      body: Buffer.isBuffer(params.body) ? Readable.from(params.body) : params.body,
    },
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
