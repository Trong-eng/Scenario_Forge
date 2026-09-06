'use client';

import { FileSliders, PanelRightOpen } from 'lucide-react';

import { useT } from '@/shared/i18n';
type Props = {
  title?: string;
  description?: string;
  meta?: string;
  onOpen: () => void;
};

export function CanvasArtifactCard({
  title = 'Definition v1',
  description = 'Thông số scenario đã có cấu trúc',
  meta,
  onOpen,
}: Props) {
  const t = useT();
  return <button
    type="button"
    onClick={onOpen}
    aria-label={`Mở canvas: ${title}`}
    className="group flex min-h-20 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left outline-none transition-[border-color,background-color,box-shadow] hover:border-primary/40 hover:bg-surface focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/30"
  >
    <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-primary">
      <FileSliders aria-hidden="true" className="size-5" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[length:calc(13.5px*var(--font-scale))] font-semibold text-foreground">{title}</span>
      <span className="mt-0.5 block truncate text-[length:calc(12px*var(--font-scale))] text-muted-foreground">{description}</span>
      {meta ? <span className="mt-1 block text-[length:calc(10.5px*var(--font-scale))] font-medium text-warning-foreground">{meta}</span> : null}
    </span>
    <span className="flex shrink-0 items-center gap-1.5 text-[length:calc(11.5px*var(--font-scale))] font-medium text-primary opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      <span className="hidden sm:inline">{t('canvas.open')}</span>
      <PanelRightOpen aria-hidden="true" className="size-4" />
    </span>
  </button>;
}
