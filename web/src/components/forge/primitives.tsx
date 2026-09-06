import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useLocaleFormat, useT, type MessageKey } from '@/shared/i18n';
import { clarificationValueLabel } from './clarificationLabels';
import { SelectField } from './SelectField';
import { structuredSpeedUnits, type Field, type Provenance } from './definitionModel';

const provenanceStyles: Record<Provenance, string> = {
  grounded: 'bg-grounded text-grounded-foreground',
  user: 'bg-userset text-userset-foreground',
  default: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

const provenanceKeys: Record<Provenance, MessageKey> = {
  grounded: 'provenance.grounded', user: 'provenance.user',
  default: 'provenance.default', unknown: 'provenance.unknown',
};

export function ProvenanceTag({ provenance, fieldId }: { provenance: Provenance; fieldId?: string }) {
  const t = useT();
  return (
    <span
      data-testid={fieldId ? `provenance-${fieldId}` : undefined}
      className={cn(
        'shrink-0 rounded-md px-2 py-[3px] text-[length:calc(10px*var(--font-scale))] font-semibold uppercase tracking-[0.08em]',
        provenanceStyles[provenance],
      )}
    >
      {t(provenanceKeys[provenance])}
    </span>
  );
}

export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'pass' | 'warn' | 'fail' | 'primary';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-muted text-muted-foreground',
    pass: 'bg-success text-success-foreground',
    warn: 'bg-warning text-warning-foreground',
    fail: 'bg-destructive/12 text-destructive',
    primary: 'bg-primary/12 text-primary',
  } as const;

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[length:calc(10px*var(--font-scale))] font-semibold uppercase tracking-[0.08em]', tones[tone])}>
      {children}
    </span>
  );
}

export function FieldRow({ field, onChange }: { field: Field; onChange: (value: string) => void }) {
  const { t, language } = useLocaleFormat();
  const numericValue = field.numericValue;
  const unitOptions = [
    { value: '', label: t('field.noUnit') },
    ...structuredSpeedUnits.map((unit) => ({ value: unit, label: unit })),
  ];
  // The name column used to be 5rem with the control taking everything left
  // over, so "Constraint · pedestrian · approach" was cut to "Constraint …"
  // while its dropdown stretched across the panel. A parameter nobody can read
  // is worse than a narrower control.
  return (
    <motion.div layout="position" className="group grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_5.25rem] items-start gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-surface/70 max-sm:grid-cols-[1fr_auto] max-sm:gap-2">
      <label htmlFor={`field-${field.id}`} className="min-w-0 self-center py-1 max-sm:col-span-2">
        <span id={`field-label-${field.id}`} className="block text-[length:calc(13px*var(--font-scale))] font-medium leading-snug text-foreground/90">{field.label}</span>
        {field.note ? <span className="block text-[length:calc(10px*var(--font-scale))] font-semibold tracking-[0.07em] text-muted-foreground/80">{field.note}</span> : null}
      </label>
      <div className="relative w-full max-w-[20rem]" title={field.readOnlyReason}>
        {/* A control the provider cannot store is worse than no control: it
            accepts a value and drops it. Show the value, refuse the edit. */}
        {field.readOnlyReason ? (
          <p id={`field-${field.id}`} aria-labelledby={`field-label-${field.id}`} aria-describedby={`field-${field.id}-reason`} className="min-h-11 truncate rounded-lg border border-dashed border-border/70 bg-surface/40 px-3 py-2.5 text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">{field.value}</p>
        ) : numericValue ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              id={`field-${field.id}`}
              type="number"
              value={field.numericDraft ?? String(numericValue.value)}
              min={field.min}
              max={field.max}
              aria-label={field.label}
              aria-invalid={field.validationMessage ? 'true' : undefined}
              aria-describedby={field.validationMessage ? `field-${field.id}-validation` : undefined}
              onChange={(event) => onChange(event.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-[length:calc(13px*var(--font-scale))] text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            <SelectField
              id={`field-${field.id}-unit`}
              value={numericValue.unit ?? ''}
              options={unitOptions}
              aria-label={t('field.unitOf', { field: field.label })}
              disabled
              readOnlyReason={field.unitReadOnlyReason}
              className="w-[5.5rem] shrink-0"
              onChange={() => undefined}
            />
            {field.validationMessage ? <span id={`field-${field.id}-validation`} role="alert" className="sr-only">{field.validationMessage}</span> : null}
          </div>
        ) : field.inputType ? (
          <input
            id={`field-${field.id}`}
            type={field.inputType}
            value={field.value === '—' ? '' : field.value}
            aria-label={field.label}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-[length:calc(13px*var(--font-scale))] text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        ) : (
          <SelectField
            id={`field-${field.id}`}
            value={field.value}
            options={(field.options ?? [field.value]).map((option) => ({ value: option, label: clarificationValueLabel(field.id, option, language) }))}
            onChange={onChange}
          />
        )}
        {field.readOnlyReason ? <span id={`field-${field.id}-reason`} className="sr-only">{field.readOnlyReason}</span> : null}
      </div>
      <span className="justify-self-start self-center"><ProvenanceTag provenance={field.provenance} fieldId={field.id} /></span>
    </motion.div>
  );
}
