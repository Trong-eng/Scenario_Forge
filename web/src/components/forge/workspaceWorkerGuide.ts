import { canvasSteps, type CanvasStep, type WorkspaceGuideState } from './workspaceCanvasModel';

export type WorkerGuideInputs = {
  stepIndex: 0 | 1 | 2;
  direction: -1 | 0 | 1;
  /** -1 deliberately means that the provider supplied no truthful progress. */
  progress: number;
  reducedMotion: boolean;
};

export type GuideRunProgress = {
  completedSteps: number | null | undefined;
  totalSteps: number | null | undefined;
};

export type GuideStepBounds = Record<CanvasStep, { left: number; right: number }>;

export function shouldPlayWorkerGuide(reducedMotion: boolean, documentHidden: boolean, inViewport: boolean) {
  return !reducedMotion && !documentHidden && inViewport;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stepIndex(step: CanvasStep): 0 | 1 | 2 {
  return canvasSteps.indexOf(step) as 0 | 1 | 2;
}

function runFraction(guide: WorkspaceGuideState, runProgress?: GuideRunProgress) {
  if (guide.activeStep !== 'run' || guide.phase !== 'working') return -1;
  const total = runProgress?.totalSteps;
  const completed = runProgress?.completedSteps;
  if (!isFiniteNumber(total) || !isFiniteNumber(completed) || total <= 0) return -1;
  return clamp(completed / total, 0, 1);
}

export function deriveWorkerGuideInputs(
  guide: WorkspaceGuideState,
  runProgress?: GuideRunProgress,
  reducedMotion = false,
): WorkerGuideInputs {
  return {
    stepIndex: stepIndex(guide.activeStep),
    direction: guide.direction === 'forward' ? 1 : guide.direction === 'backward' ? -1 : 0,
    progress: runFraction(guide, runProgress),
    reducedMotion,
  };
}

/**
 * Returns the left edge of the character. Bounds are measured from the guide
 * lane itself, so resize/split/focus changes remain spatially truthful.
 */
export function resolveWorkerGuidePosition(
  guide: WorkspaceGuideState,
  bounds: GuideStepBounds,
  laneWidth: number,
  characterWidth: number,
  progress = -1,
) {
  const active = bounds[guide.activeStep];
  const halfCharacter = characterWidth / 2;
  const minimum = 0;
  const maximum = Math.max(0, laneWidth - characterWidth);
  const usableLeft = active.left + halfCharacter;
  const usableRight = active.right - halfCharacter;
  // The worker stands on the step it is reporting, always. Walking it across
  // the Run tab in proportion to progress meant a queued run parked it at the
  // tab's left edge, reading as a misplaced sprite rather than as progress --
  // and because those steps were smaller than the travel threshold, it inched
  // sideways without ever turning to face the way it moved.
  void usableLeft;
  void usableRight;
  void progress;
  const centre = (active.left + active.right) / 2;
  return Math.round(clamp(centre - halfCharacter, minimum, maximum));
}
