'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Alert({
  title,
  messages,
  onDismiss,
}: {
  title: string;
  messages: string[];
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-medium">{title}</p>
        <ul className="mt-1 space-y-0.5">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
      <Button variant="ghost" size="icon" onClick={onDismiss} aria-label="Dismiss">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
