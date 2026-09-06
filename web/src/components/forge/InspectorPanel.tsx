import type { KeyboardEventHandler, RefObject } from 'react';
import { ChevronDown, Copy, PanelRightClose, Play, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RunEvidence } from './LiveDataViews';
import { UNKNOWN } from './definitionModel';
import { StatusPill } from './primitives';
import type { ProviderEvaluation, ProviderRunView, RegistryArtifactOutcome } from '@/shared/api/schemas';

import { useT } from '@/shared/i18n';
export type InspectorMode = 'build' | 'run';

export type InspectorLive = {
  seed: string;
  /**
   * Work the provider is still doing. A Build or a Run can take minutes, and
   * the panels used to render their empty shape meanwhile -- an identity with
   * no id, preflight with no checks -- which reads as broken rather than busy.
   */
  busy?: { kind: 'build' | 'run'; label: string; detail: string } | null;
  buildLabel: string;
  readiness: string;
  preflight: { label: string; state: 'pass' | 'hash'; value?: string }[];
  run?: ProviderRunView | null;
  evaluation?: ProviderEvaluation | null;
  artifacts?: RegistryArtifactOutcome[];
};

type Props = {
  mode: InspectorMode;
  live: InspectorLive | null;
  idle?: boolean;
  approved: boolean;
  seed: string;
  run?: ProviderRunView | null;
  evaluation?: ProviderEvaluation | null;
  artifacts?: RegistryArtifactOutcome[];
  onClose: () => void;
  onApprove: () => void;
  onCopyManifest: () => void;
  scenicSource?: string | null;
  onCopyScenic?: () => void;
  onSeedChange: (value: string) => void;
  onRun: (kind: 'Smoke' | 'Full') => void;
  overlay: boolean;
  panelRef: RefObject<HTMLElement>;
  onPanelKeyDown: KeyboardEventHandler<HTMLElement>;
  embedded?: boolean;
  showClose?: boolean;
};

/** A step the provider is still working on: what is happening, and that it is. */
function WorkingNotice({ label, detail }: { label: string; detail: string }) {
  return <section aria-live="polite" className="rounded-xl border border-border/70 bg-surface/40 p-5 text-center">
    <span aria-hidden="true" className="mx-auto mb-3 block size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    <p className="text-[length:calc(13px*var(--font-scale))] font-semibold">{label}</p>
    <p className="mx-auto mt-1 max-w-xs text-[length:calc(12.5px*var(--font-scale))] leading-relaxed text-muted-foreground">{detail}</p>
  </section>;
}

function BuildPanel({ live, approved, scenicSource, onApprove, onCopyManifest, onCopyScenic }: Pick<Props, 'live' | 'approved' | 'scenicSource' | 'onApprove' | 'onCopyManifest' | 'onCopyScenic'>) {
  const t = useT();
  const readiness = live?.readiness ?? 'Chưa sẵn sàng';
  const buildLabel = live?.buildLabel ?? 'Chưa có Build';
  const preflight = live?.preflight ?? [];
  if (live?.busy?.kind === 'build') {
    return <div className="space-y-4">
      <div className="flex items-center justify-between"><StatusPill>{readiness}</StatusPill><span className="text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">{buildLabel}</span></div>
      <WorkingNotice label={live.busy.label} detail={live.busy.detail} />
    </div>;
  }
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><StatusPill tone={readiness === 'Ready to run' ? 'pass' : undefined}>{readiness}</StatusPill><span className="text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">{buildLabel}</span></div>
    <section className="rounded-xl border border-border/70 p-3.5" aria-labelledby="build-identity-title">
      <h2 id="build-identity-title" className="mb-2 text-[length:calc(13px*var(--font-scale))] font-semibold">{t('inspector.buildIdentity')}</h2>
      <p className="font-mono text-[length:calc(12px*var(--font-scale))] text-muted-foreground">{buildLabel}</p>
      <p className="mt-2 text-[length:calc(12px*var(--font-scale))] leading-relaxed text-muted-foreground">Build là immutable artifact. Approval bên dưới áp dụng đúng manifest đang hiển thị.</p>
    </section>
    {preflight.length > 0 ? <section className="rounded-xl border border-border/70 p-3.5" aria-labelledby="preflight-title">
      <h2 id="preflight-title" className="mb-2.5 text-[length:calc(13px*var(--font-scale))] font-semibold">{t('inspector.preflight')}</h2>
      <div className="space-y-1.5">{preflight.map((item) => <div key={item.label} className="flex min-h-11 items-center justify-between gap-3"><span className="text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">{item.label}</span>{item.state === 'pass' ? <StatusPill tone="pass">Pass</StatusPill> : <button type="button" onClick={onCopyManifest} aria-label={t('inspector.copyManifestHash')} title={item.value} className="control-button min-w-0 max-w-[15rem] bg-surface px-2 text-left font-mono text-[length:calc(11px*var(--font-scale))] leading-snug"><span className="break-all">{item.value}</span><Copy aria-hidden="true" className="size-3 shrink-0" /></button>}</div>)}</div>
    </section> : <p className="rounded-xl border border-dashed border-border p-3 text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">{t('inspector.noPreflight')}</p>}
    <details className="group rounded-xl border border-border/70 bg-surface/40">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[length:calc(12.5px*var(--font-scale))] font-semibold marker:content-none">
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        Xem Scenic code
        {!scenicSource ? <span className="ml-auto text-[length:calc(11px*var(--font-scale))] font-normal text-muted-foreground">{t('inspector.noSource')}</span> : null}
      </summary>
      <div className="border-t border-border/70 p-3">
        {scenicSource ? <div className="relative rounded-lg bg-card">
          <button type="button" onClick={onCopyScenic} aria-label={t('inspector.copyScenic')} className="control-button absolute top-2 right-2 z-10 bg-card px-2"><Copy aria-hidden="true" className="size-3" />Copy</button>
          <pre className="scroll-slim overflow-x-auto p-3 pt-12 font-mono text-[length:calc(12px*var(--font-scale))] leading-relaxed text-foreground/85">{scenicSource}</pre>
        </div> : <p className="text-[length:calc(12px*var(--font-scale))] leading-relaxed text-muted-foreground">Scenic source sẽ xuất hiện sau khi Build được provider publish.</p>}
      </div>
    </details>
    <button type="button" disabled={!live || live.buildLabel === 'No Build published' || approved} onClick={onApprove} className={cn('min-h-11 w-full rounded-xl py-3 text-[length:calc(13.5px*var(--font-scale))] font-semibold transition-all duration-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45', approved ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground hover:brightness-110')}>{approved ? 'Build approved' : 'Approve build'}</button>
  </div>;
}

function RunPanel({ live, seed, run, evaluation, artifacts, approved, onSeedChange, onRun }: Pick<Props, 'live' | 'seed' | 'run' | 'evaluation' | 'artifacts' | 'approved' | 'onSeedChange' | 'onRun'>) {
  const t = useT();
  return <div className="space-y-4">
    {/* Readiness rides on the section's own heading row rather than claiming a
        row of its own: it qualifies this workflow, and the Canvas has little
        height to spare. */}
    <section className="rounded-xl border border-border/70 p-3.5" aria-labelledby="run-workflow-title">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="run-workflow-title" className="text-[length:calc(13px*var(--font-scale))] font-semibold">{t('inspector.runWorkflow')}</h2>
        <span className="ml-auto text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">{live?.buildLabel ?? 'Chưa có Build'}</span>
        <StatusPill tone={live?.readiness === 'Ready to run' ? 'pass' : undefined}>{live?.readiness ?? 'Chưa sẵn sàng'}</StatusPill>
      </div>
      {/* Seed and the two dispatches share one row: the seed is a short number,
          and giving it the full width pushed the buttons onto a row of their
          own for no gain. Narrow enough wraps them back into a stack. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">Seed<input aria-label={t('inspector.runSeed')} type="number" value={seed} onChange={(event) => onSeedChange(event.target.value)} className="min-h-11 w-24 rounded-lg border border-input bg-card px-2.5 py-1.5 font-mono text-[length:calc(12.5px*var(--font-scale))] text-foreground outline-none transition-all duration-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25" /></label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" disabled={!approved} onClick={() => onRun('Smoke')} className="flex min-h-11 min-w-[8.5rem] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[length:calc(12.5px*var(--font-scale))] font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"><Zap aria-hidden="true" className="size-3.5" />{t('inspector.smokeRun')}</button>
          <button type="button" disabled={!approved} onClick={() => onRun('Full')} className="control-button min-w-[8.5rem] justify-center disabled:cursor-not-allowed disabled:opacity-45"><Play aria-hidden="true" className="size-3.5" />{t('inspector.fullRun')}</button>
        </div>
      </div>
    </section>
    {/* Before a Run there is no evidence and no video, and stacking two empty
        frames to say so left the tab looking broken. One line is enough; the
        player appears with the Run that produces it. */}
    {/* A Run in flight keeps its evidence layout and waits inside the video
        frame: the id and status are worth reading immediately, and the frame is
        where the result will land anyway. */}
    {run
      ? <RunEvidence run={run} evaluation={evaluation ?? null} artifacts={artifacts ?? []} pending={live?.busy?.kind === 'run'} />
      : <p className="rounded-xl border border-dashed border-border px-4 py-3 text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">
            {approved
              ? 'Chưa có Run nào. Smoke run chạy nhanh để kiểm tra, Full run cho bằng chứng đầy đủ kèm video.'
              : 'Cần duyệt Build ở bước trước thì mới dispatch được Run.'}
        </p>}
  </div>;
}

export function InspectorPanel({ mode, live, idle, approved, seed, run = null, evaluation = null, artifacts = [], scenicSource = null, onClose, onApprove, onCopyManifest, onCopyScenic, onSeedChange, onRun, overlay, panelRef, onPanelKeyDown, embedded = false, showClose = true }: Props) {
  const t = useT();

  const seedLabel = live ? live.seed : UNKNOWN;
  return <aside ref={panelRef} role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label={`${mode === 'build' ? 'Build' : 'Run'} workspace`} onKeyDown={onPanelKeyDown} className={cn('panel-surface flex h-full min-h-0 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden transition-opacity duration-300', embedded ? 'w-full' : 'w-[24rem]', idle && 'opacity-60 hover:opacity-100 focus-within:opacity-100')}>
    {/* Embedded in the Canvas the tab already names this panel, and the seed is
        repeated on the status row below, so the header would only cost height.
        The region keeps its accessible name from the aside's aria-label. */}
    {embedded ? null : <div className="flex items-center gap-1 border-b border-border/70 px-3 py-2.5"><div><h1 className="text-[length:calc(14px*var(--font-scale))] font-semibold">{mode === 'build' ? 'Build' : 'Run'}</h1><p className="text-[length:calc(11px*var(--font-scale))] text-muted-foreground">{mode === 'build' ? 'Build và approval của manifest hiện tại' : 'Runtime, evaluation và video evidence'}</p></div><div className="ml-auto flex items-center gap-1"><StatusPill>Seed {seedLabel}</StatusPill>{showClose ? <button type="button" onClick={onClose} aria-label={t('inspector.close')} className="icon-button"><PanelRightClose aria-hidden="true" className="size-4" /></button> : null}</div></div>}
    <div data-testid="inspector-scroll-region" className="scroll-pane scroll-slim min-h-0 flex-1 overflow-y-auto p-3">{mode === 'build' ? <BuildPanel live={live} approved={approved} scenicSource={scenicSource} onApprove={onApprove} onCopyManifest={onCopyManifest} onCopyScenic={onCopyScenic} /> : <RunPanel live={live} seed={seed} run={run} evaluation={evaluation} artifacts={artifacts} approved={approved} onSeedChange={onSeedChange} onRun={onRun} />}</div>
  </aside>;
}
