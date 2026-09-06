'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ProviderDefinition,
  ProviderEvaluation,
  ProviderRunView,
  RegistryArtifactOutcome,
} from '@/shared/api/schemas';

import { useT } from '@/shared/i18n';
type Leaf = { label: string; value: string };

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function flatten(value: unknown, prefix = '', depth = 0): Leaf[] {
  if (depth > 3) return [{ label: prefix || 'Value', value: scalar(value) }];
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ label: prefix || 'Value', value: 'None' }];
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return [{ label: prefix || 'Value', value: value.map(scalar).join(', ') }];
    }
    return value.flatMap((item, index) => flatten(item, `${prefix} ${index + 1}`.trim(), depth + 1));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [{ label: prefix || 'Value', value: 'None' }];
    return entries.flatMap(([key, item]) => flatten(item, [prefix, titleCase(key)].filter(Boolean).join(' · '), depth + 1));
  }
  return [{ label: prefix || 'Value', value: scalar(value) }];
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = (value ?? 'unavailable').toLowerCase();
  const positive = ['pass', 'passed', 'succeeded', 'approved', 'published', 'valid', 'ready'].some((item) => normalized.includes(item));
  const negative = ['fail', 'error', 'corrupt', 'cancel', 'tombstone'].some((item) => normalized.includes(item));
  const tone = positive ? 'bg-success text-success-foreground' : negative ? 'bg-destructive/10 text-destructive' : 'bg-warning text-warning-foreground';
  return <span className={`inline-flex min-h-7 items-center rounded-md px-2.5 text-[0.6875rem] font-bold uppercase tracking-wide ${tone}`}>{value ?? 'Unavailable'}</span>;
}

export function FieldRows({ value, empty }: { value: unknown; empty?: string }) {
  const t = useT();
  const emptyText = empty ?? t('evidence.noProviderValues');
  const rows = flatten(value);
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return <dl className="divide-y divide-border/70">{rows.map((row, index) => <div key={`${row.label}-${index}`} className="grid grid-cols-[minmax(8rem,0.9fr)_minmax(0,1.2fr)] gap-3 py-2.5 text-xs"><dt className="text-muted-foreground">{row.label}</dt><dd className="min-w-0 break-words text-right font-medium tabular-nums">{row.value}</dd></div>)}</dl>;
}

export function ClaimsView({ definition }: { definition: ProviderDefinition }) {
  const t = useT();
  if (!definition.claims.length) return <p className="rounded-lg bg-surface p-3 text-sm text-muted-foreground">{t('evidence.noClaims')}</p>;
  return <div className="space-y-2">{definition.claims.map((claim, index) => {
    const value = [scalar(claim.value), claim.unit ? scalar(claim.unit) : ''].filter(Boolean).join(' ');
    return <article key={`${scalar(claim.field)}-${index}`} className="rounded-xl border border-border/70 bg-card p-3"><div className="flex items-center gap-2"><strong className="text-sm">{titleCase(scalar(claim.field))}</strong><span className="ml-auto text-[0.6875rem] font-semibold uppercase text-primary">{scalar(claim.source)}</span></div><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>{claim.evidence ? <p className="mt-2 text-xs text-muted-foreground">Evidence: {scalar(claim.evidence)}</p> : null}</article>;
  })}</div>;
}

export function selectRunVideoArtifact(artifacts: RegistryArtifactOutcome[]) {
  return artifacts.find((item) => {
    if (item.status !== 'published' || !item.public_uri) return false;
    return /run[_-]?video|video\/|\.(?:mp4|webm)(?:$|[?#])/i.test(`${item.artifact_id} ${item.public_uri}`);
  }) ?? null;
}

/**
 * What the video frame says while the Run is still producing one.
 *
 * The wait is minutes long, so the frame keeps the reader company rather than
 * repeating one sentence: the line changes every few seconds, and stops moving
 * entirely under reduced motion.
 */
const waitingLines = [
  'CARLA đang dựng cảnh và chạy kịch bản…',
  'Đang ghi lại video bằng chứng cho Run này…',
  'Bước này mất vài phút — bạn có thể pha một tách cà phê.',
  'Đang thu thập evaluation và artifact…',
  'Sắp xong rồi. Video sẽ hiện ngay tại khung này.',
];

function VideoWaiting() {
  const [line, setLine] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setStill(reduced);
    if (reduced) return;
    const timer = setInterval(() => setLine((current) => (current + 1) % waitingLines.length), 5_000);
    return () => clearInterval(timer);
  }, []);

  return <div aria-live="polite" className="grid aspect-video max-h-[38vh] w-auto max-w-full mx-auto place-items-center rounded-xl border border-dashed border-border bg-surface/70 p-6 text-center">
    <div>
      <span aria-hidden="true" className="mx-auto mb-4 flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className={cn('size-2 rounded-full bg-primary/70', !still && 'animate-pulse')}
            style={still ? undefined : { animationDelay: `${dot * 0.18}s`, animationDuration: '1.1s' }}
          />
        ))}
      </span>
      <p className="text-sm font-semibold">Đang xử lý Run…</p>
      <p className="mx-auto mt-1 min-h-[2.5rem] max-w-xs text-xs leading-relaxed text-muted-foreground transition-opacity duration-500">
        {waitingLines[still ? 0 : line]}
      </p>
    </div>
  </div>;
}

export function RunVideoEvidence({ run, artifacts, pending = false }: { run: ProviderRunView | null; artifacts: RegistryArtifactOutcome[]; pending?: boolean }) {
  const t = useT();
  const video = selectRunVideoArtifact(artifacts);
  // Capped so the player lands inside the Canvas on load instead of pushing the
  // run details below the fold, and centred rather than stretched: the width
  // follows the capped height, so the box stays 16:9 instead of letterboxing
  // inside a full-width frame. The player's own controls carry seeking,
  // settings and fullscreen for anyone who wants it larger.
  return <section aria-labelledby="run-video-title">
    <h3 id="run-video-title" className="mb-2 text-xs font-semibold">Video</h3>
    {pending && !video?.public_uri
      ? <VideoWaiting />
      : video?.public_uri
      ? <video controls src={video.public_uri} className="mx-auto aspect-video max-h-[38vh] w-auto max-w-full rounded-xl border border-border bg-surface object-contain" aria-label={t('evidence.runVideo')} />
      : <div className="mx-auto grid aspect-video max-h-[38vh] w-auto max-w-full place-items-center rounded-xl border border-dashed border-border bg-surface/70 p-6 text-center"><div>
          {/* The wait has ended by the time this renders, so it must not promise
              a video that is not coming: a finished Run either published one or
              did not. */}
          <p className="text-sm font-semibold">{run ? 'Run này không có video' : 'Chưa có video'}</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">{run
            ? 'Run đã kết thúc mà không publish artifact run_video được uỷ quyền. Chi tiết runtime vẫn xem được bên dưới.'
            : 'Dispatch một Run thật để CARLA sinh video bằng chứng.'}</p>
        </div></div>}
  </section>;
}

export function RunEvidence({ run, evaluation, artifacts, pending = false }: { run: ProviderRunView; evaluation: ProviderEvaluation | null; artifacts: RegistryArtifactOutcome[]; pending?: boolean }) {
  const t = useT();

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-xs">{run.run.run_id}</strong><StatusBadge value={run.status} />{evaluation ? <StatusBadge value={evaluation.evaluation.outcome} /> : null}<span className="text-xs text-muted-foreground">Seed {run.run.seed}{run.run.mode ? ` · ${run.run.mode}` : ''}</span></div>
    {run.failure ? <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-3" aria-labelledby="run-failure-title"><h3 id="run-failure-title" className="mb-2 text-xs font-semibold text-destructive">{t('evidence.runFailed')}</h3><FieldRows value={run.failure} /></section> : null}
    <RunVideoEvidence run={run} artifacts={artifacts} pending={pending} />
    {/* Opening the disclosure at the bottom of a scrolled panel otherwise
        reveals its content off-screen: the reader clicks and nothing appears to
        happen. Bring the section to the top of the pane instead. */}
    <details
      className="group rounded-xl border border-border/70 bg-surface/40"
      onToggle={(event) => {
        const section = event.currentTarget;
        if (!section.open) return;
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-xs font-semibold marker:content-none"><span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>{t('evidence.technicalDetail')}</summary>
      <div className="space-y-4 border-t border-border/70 p-3">
        <section><h3 className="mb-2 text-xs font-semibold">{t('evidence.runtime')}</h3><FieldRows value={{ pipeline_phase: run.progress.phase, completed_pipeline_phases: run.progress.completed_steps, total_pipeline_phases: run.progress.total_steps, sampled_values: run.sampled_values, versions: run.versions, cleanup: run.cleanup }} /></section>
        <section><h3 className="mb-2 text-xs font-semibold">Evaluation</h3>{evaluation ? <FieldRows value={evaluation.report} /> : <p className="rounded-lg bg-card p-3 text-xs text-muted-foreground">{t('evidence.noEvaluation')}</p>}</section>
        <section><h3 className="mb-2 text-xs font-semibold">{t('evidence.authorizedArtifacts')}</h3>{artifacts.length ? <div className="space-y-2">{artifacts.map((artifact) => <div key={artifact.artifact_id} className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs"><span className="min-w-0 flex-1 truncate font-mono">{artifact.artifact_id}</span><StatusBadge value={artifact.status} />{artifact.status === 'published' && artifact.public_uri ? <a href={artifact.public_uri} target="_blank" rel="noreferrer" className="font-semibold text-primary">Open</a> : null}</div>)}</div> : <p className="text-xs text-muted-foreground">{t('evidence.noArtifacts')}</p>}</section>
      </div>
    </details>
  </div>;
}
