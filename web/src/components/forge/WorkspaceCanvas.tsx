'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Circle, CircleAlert, LoaderCircle, LockKeyhole, Maximize2, Minimize2, X } from 'lucide-react';
import { cn, getRovingTabIndex } from '@/lib/utils';
import { canvasSteps, type CanvasPresentation, type CanvasStep, type CanvasStepState, type CanvasStepView, type WorkspaceGuideState } from './workspaceCanvasModel';
import { WorkspaceCharacterGuide } from './WorkspaceCharacterGuide';
import type { GuideRunProgress } from './workspaceWorkerGuide';
import { shouldRenderWorkspaceWorkerGuide, workspaceWorkerGuideAsset } from './workspaceWorkerGuideAsset';

import { useT } from '@/shared/i18n';
type Props = {
  steps: readonly CanvasStepView[];
  activeStep: CanvasStep;
  guide: WorkspaceGuideState;
  runProgress?: GuideRunProgress;
  runTerminal?: boolean;
  onStepChange: (step: CanvasStep) => void;
  presentation: Exclude<CanvasPresentation, 'closed'>;
  fullscreenAvailable?: boolean;
  onPresentationChange: (presentation: Exclude<CanvasPresentation, 'closed'>) => void;
  onClose: () => void;
  structured: ReactNode;
  build: ReactNode;
  run: ReactNode;
};

const stateCopy: Record<CanvasStepState, string> = {
  locked: 'Bị khóa',
  available: 'Sẵn sàng',
  working: 'Đang chạy',
  complete: 'Hoàn tất',
  failed: 'Có lỗi',
};

function StepIcon({ state }: { state: CanvasStepState }) {
  if (state === 'complete') return <Check aria-hidden="true" className="size-3.5" />;
  if (state === 'working') return <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />;
  if (state === 'failed') return <CircleAlert aria-hidden="true" className="size-3.5" />;
  if (state === 'locked') return <LockKeyhole aria-hidden="true" className="size-3.5" />;
  return <Circle aria-hidden="true" className="size-3.5" />;
}

export function WorkspaceCanvas({ steps, activeStep, guide, runProgress, runTerminal = false, onStepChange, presentation, fullscreenAvailable = true, onPresentationChange, onClose, structured, build, run }: Props) {
  const t = useT();
  const content: Record<CanvasStep, ReactNode> = { structured, build, run };
  const constrainedFullscreen = presentation === 'fullscreen';
  const guideLaneRef = useRef<HTMLDivElement>(null);
  const guideAnchorRefs = useRef<Partial<Record<CanvasStep, HTMLButtonElement | null>>>({});
  const workerGuideEnabled = shouldRenderWorkspaceWorkerGuide(workspaceWorkerGuideAsset.enabled, fullscreenAvailable);

  useEffect(() => {
    if (presentation !== 'fullscreen') return;
    const collapseOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onPresentationChange('split');
    };
    window.addEventListener('keydown', collapseOnEscape);
    return () => window.removeEventListener('keydown', collapseOnEscape);
  }, [onPresentationChange, presentation]);

  return <section
    aria-label={t('canvas.region')}
    data-guide-step={guide.activeStep}
    data-guide-phase={guide.phase}
    data-guide-direction={guide.direction}
    data-presentation={presentation}
    className={cn('flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card', presentation === 'fullscreen' && 'fixed inset-0 z-[70] h-dvh w-dvw shadow-[0_24px_80px_rgba(43,31,24,0.18)]')}
  >
    <div className="shrink-0 border-b border-border/70 bg-card px-3 py-2">
      <div className={cn('flex items-end gap-2', constrainedFullscreen && 'mx-auto w-full max-w-[80rem]')}>
      <div className="min-w-0 flex-1">
      <div ref={guideLaneRef} data-testid="workspace-guide-lane" className={cn('relative min-w-0 overflow-hidden', workerGuideEnabled ? 'h-[126px]' : 'h-0')}>
        <WorkspaceCharacterGuide
          enabled={workerGuideEnabled}
          guide={guide}
          runProgress={runProgress}
          runTerminal={runTerminal}
          workPending={steps.some((step) => step.state !== 'complete')}
          laneRef={guideLaneRef}
          anchorRefs={guideAnchorRefs}
        />
      </div>
      <div role="tablist" aria-label="Workbench views" className="flex min-w-0 items-center gap-1 rounded-lg bg-surface/80 p-1">
        {steps.map((step, index) => {
          const active = activeStep === step.id;
          return <button
            type="button"
            role="tab"
            id={`canvas-step-${step.id}`}
            aria-controls={`canvas-panel-${step.id}`}
            aria-selected={active}
            aria-describedby={step.reasonKey ? `canvas-step-reason-${step.id}` : undefined}
            disabled={step.state === 'locked'}
            tabIndex={active ? 0 : -1}
            key={step.id}
            ref={(element) => { guideAnchorRefs.current[step.id] = element; }}
            onClick={() => onStepChange(step.id)}
            onKeyDown={(event) => {
              const enabled = steps.filter((candidate) => candidate.state !== 'locked');
              const current = enabled.findIndex((candidate) => candidate.id === step.id);
              const nextIndex = getRovingTabIndex(event.key, current, enabled.length);
              if (nextIndex === null) return;
              event.preventDefault();
              const next = enabled[nextIndex];
              if (!next) return;
              onStepChange(next.id);
              document.getElementById(`canvas-step-${next.id}`)?.focus();
            }}
            title={step.reasonKey ? t(step.reasonKey) : undefined}
            className={cn('relative flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-center transition-colors', active ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground', step.state === 'failed' && 'text-destructive', step.state === 'locked' && 'cursor-not-allowed opacity-60')}
          >
            <span data-testid={`canvas-guide-anchor-${step.id}`} data-guide-anchor={step.id} className="grid size-5 shrink-0 place-items-center rounded-full border border-current/20"><StepIcon state={step.state} /></span>
            <span className="min-w-0"><span className="block truncate text-xs font-semibold">{t(step.labelKey)}</span><span className="sr-only"> — {stateCopy[step.state]}</span></span>
            {step.reasonKey ? <span id={`canvas-step-reason-${step.id}`} className="sr-only">{t(step.reasonKey)}</span> : null}
          </button>;
        })}
      </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {fullscreenAvailable ? presentation === 'fullscreen' ? (
          <button type="button" onClick={() => onPresentationChange('split')} aria-label="Thu canvas về panel" title="Thu canvas về panel" className="icon-button"><Minimize2 aria-hidden="true" className="size-4" /></button>
        ) : (
          <button type="button" onClick={() => onPresentationChange('fullscreen')} aria-label="Phóng to canvas" title="Phóng to canvas" className="icon-button"><Maximize2 aria-hidden="true" className="size-4" /></button>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Đóng canvas" title="Đóng canvas" className="icon-button"><X aria-hidden="true" className="size-4" /></button>
      </div>
      </div>
    </div>
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
      <div data-testid="canvas-content-frame" className={cn('h-full min-h-0 min-w-0', constrainedFullscreen && 'mx-auto w-full max-w-[80rem]')}>
      {canvasSteps.map((step) => <div
        id={`canvas-panel-${step}`}
        role="tabpanel"
        aria-labelledby={`canvas-step-${step}`}
        hidden={activeStep !== step}
        key={step}
        className="h-full min-h-0 min-w-0 overflow-hidden"
      >{content[step]}</div>)}
      </div>
    </div>
  </section>;
}
