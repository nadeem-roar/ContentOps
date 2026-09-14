'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { CloudUpload, ExternalLink, Upload } from 'lucide-react';
import { markAssetFinal } from '@/app/actions/assets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ContentAsset } from '@/lib/types';

export function AssetPanel({ cardId, assets }: { cardId: string; assets: ContentAsset[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File) {
    // Sent as a raw body, not multipart, so the server can pipe it straight to Drive
    // without holding a 500 MB video in memory.
    const url =
      `/api/assets/upload?cardId=${encodeURIComponent(cardId)}` +
      `&fileName=${encodeURIComponent(file.name)}`;

    startTransition(async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': file.type || 'application/octet-stream' },
          body: file,
        });

        const result = await response.json().catch(() => ({}));
        setError(response.ok ? null : (result.error ?? 'Upload failed.'));
      } catch {
        setError('Upload failed. Check your connection and try again.');
      }

      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    });
  }

  return (
    <section className="mt-4 rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold">Creatives</h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {pending ? 'Uploading…' : 'Upload'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </div>

      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

      {assets.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No creatives yet. Uploads go straight to the campaign&rsquo;s Working folder in
          Drive. Review is blocked until something is uploaded.
        </p>
      ) : (
        <ul className="mt-3 divide-y">
          {assets.map((asset) => (
            <li key={asset.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <Badge variant={asset.kind === 'final' ? 'success' : 'secondary'}>
                v{asset.version} {asset.kind}
              </Badge>

              <span className="truncate font-medium">{asset.file_name}</span>

              <span className="text-xs text-muted-foreground">
                {format(parseISO(asset.created_at), 'd MMM, HH:mm')}
              </span>

              <div className="ml-auto flex items-center gap-2">
                {asset.kind === 'final' && !asset.filed_at ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <CloudUpload className="h-3.5 w-3.5" />
                    {asset.filing_error ? 'filing failed' : 'filing to Drive'}
                  </span>
                ) : null}

                {asset.drive_url ? (
                  <a
                    href={asset.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs underline"
                  >
                    {asset.filed_at ? 'In Final' : 'In Working'}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}

                {asset.kind !== 'final' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      startTransition(async () => {
                        await markAssetFinal(asset.id);
                        router.refresh();
                      })
                    }
                  >
                    Mark final
                  </Button>
                ) : null}
              </div>

              {asset.filing_error ? (
                <p className="w-full text-xs text-destructive">{asset.filing_error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
