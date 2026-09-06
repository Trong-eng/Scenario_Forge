import React from 'react';

/** Predates the token system: it used to carry hard-coded slate hex values,
 *  which meant it stayed dark-slate on the light product and stayed the wrong
 *  dark on the dark one. It reads from the same tokens as everything else now.
 */
export function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center text-muted-foreground"
      data-testid="empty-state"
    >
      <svg
        aria-hidden="true"
        className="mx-auto mb-3 size-10 opacity-60"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
      <p className="text-[length:calc(14px*var(--font-scale))] font-medium">{message}</p>
    </div>
  );
}
