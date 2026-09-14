import { Readable, Transform } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ensureCampaignFolders, uploadFile } from '@/lib/drive/client';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_BYTES = 500 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
]);

const UPLOAD_ROLES = ['admin', 'manager', 'strategist', 'designer'];

/**
 * Caps what actually reaches Drive, and counts it.
 *
 * `content-length` is only a hint: it is client-supplied, and a chunked upload omits it
 * entirely, so checking the header alone lets an unbounded stream through. This stops the
 * stream at the limit instead of trusting the claim, and reports the real byte count so
 * the recorded size is measured rather than declared.
 */
function limitBytes(source: NodeJS.ReadableStream, max: number) {
  const state = { bytes: 0, exceeded: false };

  const stream = source.pipe(
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        state.bytes += chunk.length;
        if (state.bytes > max) {
          state.exceeded = true;
          callback(new Error('Upload exceeds the size limit.'));
          return;
        }
        callback(null, chunk);
      },
    }),
  );

  return { stream, state };
}

/**
 * Uploads a creative straight into the campaign's Working/ folder in Drive.
 *
 * The file arrives as the raw request body rather than multipart form data, and is piped
 * to Drive without being buffered. That is deliberate: a Server Action would have to hold
 * the whole file in memory and is capped by bodySizeLimit, which a 500 MB video blows
 * through immediately.
 *
 * Metadata travels in the query string, which is safe here — a card id and a filename,
 * no personal data.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const params = z
    .object({
      cardId: z.string().uuid(),
      fileName: z.string().min(1).max(255),
    })
    .safeParse({
      cardId: searchParams.get('cardId'),
      fileName: searchParams.get('fileName'),
    });

  if (!params.success) {
    return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });
  }

  const mimeType = request.headers.get('content-type') ?? '';
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `${mimeType || 'That file type'} is not accepted.` },
      { status: 415 },
    );
  }

  // A cheap early rejection for honest clients. The stream is capped for the rest.
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is over the 500 MB limit.' }, { status: 413 });
  }

  if (!request.body) {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile?.is_active || !UPLOAD_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'You cannot upload creatives.' }, { status: 403 });
  }

  // RLS keeps this honest: a card the caller cannot read comes back empty.
  const { data: card } = await supabase
    .from('content_items')
    .select('id, client:clients ( name ), campaign:campaigns ( name )')
    .eq('id', params.data.cardId)
    .single();

  const item = card as any;
  if (!item?.client?.name) {
    return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
  }

  const counted = limitBytes(Readable.fromWeb(request.body as any), MAX_BYTES);

  try {
    const { workingFolderId } = await ensureCampaignFolders(
      item.client.name,
      item.campaign?.name ?? null,
    );

    const uploaded = await uploadFile({
      name: params.data.fileName,
      mimeType,
      parentId: workingFolderId,
      body: counted.stream,
    });

    const { error } = await supabase.from('content_assets').insert({
      content_item_id: params.data.cardId,
      file_name: params.data.fileName,
      mime_type: mimeType,
      byte_size: counted.state.bytes || null,
      drive_file_id: uploaded.fileId,
      drive_url: uploaded.webViewLink,
      drive_parent_id: workingFolderId,
      uploaded_by: user.id,
      kind: 'working',
    });

    if (error) {
      // The row failed but the file is in Drive. Leave it: an orphan in Working/ is
      // visible and recoverable, whereas deleting someone's upload is not.
      return NextResponse.json(
        { error: `Uploaded to Drive but not recorded: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, driveUrl: uploaded.webViewLink });
  } catch (err) {
    // Checked on the flag rather than the error, because the stream error reaches here
    // having passed through the Drive client and may not arrive intact.
    if (counted.state.exceeded) {
      return NextResponse.json({ error: 'That file is over the 500 MB limit.' }, { status: 413 });
    }

    const message = err instanceof Error ? err.message : 'Upload failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
