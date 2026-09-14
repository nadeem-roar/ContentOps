#!/usr/bin/env node
/**
 * One-time helper: obtains a Google Drive refresh token by OAuth consent.
 *
 * Needed when the organisation enforces `iam.disableServiceAccountKeyCreation`, which
 * blocks downloadable service account keys. Run it once, store the printed refresh token
 * as GOOGLE_OAUTH_REFRESH_TOKEN, and the app trades it for access tokens from then on.
 *
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... npm run drive:token
 *
 * The redirect URI below must be registered on the OAuth client in Google Cloud.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import { google } from 'googleapis';

const PORT = Number(process.env.OAUTH_PORT ?? 53682);
const REDIRECT_URI = `http://localhost:${PORT}/`;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first.\n');
  console.error('Create them in Google Cloud → APIs & Services → Credentials →');
  console.error('Create credentials → OAuth client ID → Web application, and add');
  console.error(`${REDIRECT_URI} as an authorised redirect URI.`);
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2({ clientId, clientSecret, redirectUri: REDIRECT_URI });

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  // Without this, a second run returns no refresh token because consent is remembered.
  prompt: 'consent',
});

console.log('\nA browser window should open. Sign in as the account that should own the');
console.log('Drive files, and approve the Drive permission.\n');
console.log('If nothing opens, copy this URL into your browser by hand:\n');
console.log(authUrl);
console.log('\nWaiting for the redirect…\n');

/**
 * Opens the consent page in the default browser. Best effort: failing is not fatal.
 *
 * Windows goes through rundll32 rather than `cmd /c start`, because cmd treats the `&`
 * between query parameters as a command separator and hands the browser a URL truncated
 * at the first one — which Google rejects for a missing response_type.
 */
function openBrowser(target) {
  const commands = {
    win32: ['rundll32', ['url.dll,FileProtocolHandler', target]],
    darwin: ['open', [target]],
  };
  const [cmd, args] = commands[process.platform] ?? ['xdg-open', [target]];

  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // The URL is printed above; the user can open it themselves.
  }
}

openBrowser(authUrl);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`Authorisation failed: ${error}. You can close this tab.`);
    console.error(`\nAuthorisation failed: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.end('Waiting for the authorisation code.');
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.end('Done. You can close this tab and go back to the terminal.');

    if (!tokens.refresh_token) {
      console.error('\nNo refresh token came back. Revoke the app at');
      console.error('https://myaccount.google.com/permissions and run this again.');
      server.close();
      process.exit(1);
    }

    console.log('Add this to your secrets as GOOGLE_OAUTH_REFRESH_TOKEN:\n');
    console.log(tokens.refresh_token);
    console.log('\nTreat it like a password. It grants Drive access as the account you');
    console.log('just signed in with, and does not expire on its own.\n');
  } catch (err) {
    res.end('Token exchange failed. Check the terminal.');
    console.error('\nToken exchange failed:', err instanceof Error ? err.message : err);
    server.close();
    process.exit(1);
  }

  server.close();
  process.exit(0);
});

server.listen(PORT);
