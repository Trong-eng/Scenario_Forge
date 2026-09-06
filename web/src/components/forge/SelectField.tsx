'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  'aria-label'?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  readOnlyReason?: string;
  /** Rendered inside the trigger, before the label. */
  prefix?: string;
};

/** A listbox that obeys the product's design language.
 *
 *  A native `<select>` can be styled shut but not open: the option list is drawn
 *  by the operating system, so it arrives with a system-blue highlight and system
 *  metrics that belong to no design. That is the one part users actually judge,
 *  so the list is rendered here instead.
 *
 *  Keyboard behaviour follows the native control it replaces: Up/Down move the
 *  active option, Home/End jump, Enter/Space commit, Escape cancels, and focus
 *  returns to the trigger — a prettier control that cannot be driven from the
 *  keyboard would be a downgrade, not polish.
 */
export function SelectField({ value, options, onChange, id, className, disabled = false, readOnlyReason, prefix, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const reasonId = `${listId}-reason`;
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.querySelectorAll('li')[active];
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    containerRef.current?.querySelector('button')?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); containerRef.current?.querySelector('button')?.focus(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(options.length - 1, index + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    if (event.key === 'End') { event.preventDefault(); setActive(options.length - 1); }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit(active); }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={rest['aria-label']}
        aria-describedby={readOnlyReason ? reasonId : undefined}
        title={readOnlyReason}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-lg border border-input bg-card py-2 pr-3 pl-3 text-left text-[length:calc(13px*var(--font-scale))] text-foreground',
          'transition-all duration-200 hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
          open && 'border-primary ring-2 ring-ring/25',
          disabled && 'cursor-not-allowed opacity-70 hover:border-input',
          className,
        )}
      >
        {prefix ? <span className="shrink-0 text-muted-foreground">{prefix}</span> : null}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ''}</span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {readOnlyReason ? <span id={reasonId} className="sr-only">{readOnlyReason}</span> : null}

      <AnimatePresence>
        {open ? (
          <motion.ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={rest['aria-label']}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="scroll-slim absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg"
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(index)}
                className={cn(
                  'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-[length:calc(13px*var(--font-scale))] transition-colors',
                  index === active ? 'bg-surface text-foreground' : 'text-foreground/85',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.value === value ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" /> : null}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
