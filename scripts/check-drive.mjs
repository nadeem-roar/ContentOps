#!/usr/bin/env node
/**
 * Verifies the Drive credentials and the root folder, without involving the app.
 *
 * It creates a folder, writes a file into it, renames and moves that file, then deletes
 * everything it made — the same sequence the upload route and the filing worker perform.
 * If this passes, a failure in the app is the app's fault, not Drive's.
 *
 *   npm run drive:check
 *
 * Reads the same variables the app does, so run it with the values you gave Roar.
 */

import { google } from 'googleapis';
import { Readable } from 'node:stream';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

function fail(message) {
  console.error(`\n  FAILED  ${message}\n`);
  process.exit(1);
}

function ok(message) {
  console.log(`  ok      ${message}`);
}

if (!root) fail('GOOGLE_DRIVE_ROOT_FOLDER_ID is not set.');

function buildAuth() {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
    const auth = new google.auth.OAuth2({ clientId, clientSecret });
    auth.setCredentials({ refresh_token: refreshToken });
    console.log('  using   OAuth refresh token');
    return auth;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (email && key) {
    console.log('  using   service account key');
    return new google.auth.JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
      subject: process.env.GOOGLE_DRIVE_IMPERSONATE_USER || undefined,
    });
  }

  fail('No Drive credentials set. Provide the GOOGLE_OAUTH_* trio.');
}

const drive = google.drive({ version: 'v3', auth: buildAuth() });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let folderId;
let fileId;

try {
  const rootInfo = await drive.files.get({
    fileId: root,
    fields: 'id, name, mimeType, driveId',
    supportsAllDrives: true,
  });

  ok(`reached root folder "${rootInfo.data.name}"`);

  if (!rootInfo.data.driveId) {
    console.log(
      '  warn    Not a Shared Drive. Uploads may fail on quota, because files would be\n' +
        '          owned by the uploading identity rather than by the drive.',
    );
  } else {
    ok('root is a Shared Drive, so files are owned by the drive');
  }

  const folder = await drive.files.create({
    requestBody: { name: `_contentops-check-${stamp}`, mimeType: FOLDER_MIME, parents: [root] },
    fields: 'id',
    supportsAllDrives: true,
  });
  folderId = folder.data.id;
  ok('created a folder');

  const file = await drive.files.create({
    requestBody: { name: 'check.txt', parents: [folderId] },
    media: { mimeType: 'text/plain', body: Readable.from(Buffer.from('contentops check')) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  fileId = file.data.id;
  ok('uploaded a file');

  const nested = await drive.files.create({
    requestBody: { name: 'Final', mimeType: FOLDER_MIME, parents: [folderId] },
    fields: 'id',
    supportsAllDrives: true,
  });

  await drive.files.update({
    fileId,
    addParents: nested.data.id,
    removeParents: folderId,
    requestBody: { name: 'renamed_v1.txt' },
    fields: 'id',
    supportsAllDrives: true,
  });
  ok('moved and renamed it, which is what approval does');

  console.log('\n  Drive is configured correctly.\n');
} catch (err) {
  const message = err?.errors?.[0]?.message ?? err?.message ?? String(err);

  if (/File not found/i.test(message)) {
    fail(
      `Drive cannot see folder ${root}.\n` +
        '          Either the id is wrong, or the authenticated account has no access to it.',
    );
  }
  if (/invalid_grant/i.test(message)) {
    fail(
      'The refresh token was rejected. It may have been revoked, or the client id and\n' +
        '          secret may not be the pair it was issued to. Re-run npm run drive:token.',
    );
  }
  if (/insufficient|forbidden|403/i.test(message)) {
    fail(`Permission refused by Drive: ${message}`);
  }

  fail(message);
} finally {
  // Best effort: leave nothing behind even if a step above failed.
  if (folderId) {
    try {
      await drive.files.delete({ fileId: folderId, supportsAllDrives: true });
      ok('cleaned up');
    } catch {
      console.log(`  warn    Could not delete the test folder. Remove it by hand: ${folderId}`);
    }
  }
}
