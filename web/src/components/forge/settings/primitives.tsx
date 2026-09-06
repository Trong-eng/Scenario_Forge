'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The product has no Button/Input/Switch/Tabs primitives — every control in
 *  it is a raw element with inline Tailwind. These are the few this surface
 *  needed enough times to be worth naming, and they are written in the same
 *  idiom as the rest so they do not read as an imported design system.
 */

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h4 className="text-[length:calc(13px*var(--font-scale))] font-semibold">{title}</h4>
        {description ? <p className="text-[length:calc(11.5px*var(--font-scale))] leading-relaxed text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function SettingRow({ label, hint, htmlFor, control, stacked = false }: {
  label: string; hint?: string; htmlFor?: string; control: ReactNode; stacked?: boolean;
}) {
  return (
    <div className={cn('flex gap-4 border-b border-border/60 py-3 last:border-0', stacked ? 'flex-col' : 'items-center justify-between max-sm:flex-col max-sm:items-stretch')}>
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={htmlFor} className="block text-[length:calc(12.5px*var(--font-scale))] font-medium">{label}</label>
        {hint ? <p className="text-[length:calc(11.5px*var(--font-scale))] leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn('shrink-0', stacked && 'w-full')}>{control}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, id, disabled }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; id?: string; disabled?: boolean;
}) {
  const fallbackId = useId();
  return (
    <button
      type="button"
      id={id ?? fallbackId}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-45',
        checked ? 'border-primary bg-primary' : 'border-input bg-surface-strong',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block size-4.5 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[1.4rem]' : 'translate-x-[0.15rem]',
        )}
      />
    </button>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; icon?: ReactNode };

/** A radiogroup rather than a row of buttons: these are mutually exclusive
 *  choices, so arrow keys should move between them the way they do in a native
 *  radio group.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, label, id }: {
  value: T; options: readonly SegmentOption<T>[]; onChange: (next: T) => void; label: string; id?: string;
}) {
  const move = (delta: number) => {
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      }}
      className="inline-flex rounded-lg border border-input bg-surface/60 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-9 items-center gap-1.5 rounded-[0.4rem] px-3 text-[length:calc(12px*var(--font-scale))] transition-colors',
              active ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function TextInput({ id, value, onChange, type = 'text', className, ...rest }: {
  id?: string; value: string; onChange: (next: string) => void; type?: string; className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'id' | 'className'>) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn('min-h-11 rounded-lg border border-input bg-card px-3 text-[length:calc(13px*var(--font-scale))] outline-none focus:ring-2 focus:ring-ring/25', className)}
      {...rest}
    />
  );
}

export function PrimaryButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn('min-h-11 rounded-lg bg-primary px-4 text-[length:calc(12.5px*var(--font-scale))] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 disabled:opacity-45', rest.className)}
    >
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: 'ok' | 'error' | 'info'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg px-3 py-2 text-[length:calc(12.5px*var(--font-scale))] leading-relaxed',
        tone === 'ok' && 'bg-success text-success-foreground',
        tone === 'error' && 'bg-destructive/10 text-destructive',
        tone === 'info' && 'bg-surface text-muted-foreground',
      )}
    >
      {children}
    </p>
  );
}

export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="rounded-xl border border-border/70 bg-surface/50 px-3">{children}</dl>;
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <dt className="shrink-0 text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-[length:calc(13px*var(--font-scale))] font-medium">{value}</dd>
    </div>
  );
}
