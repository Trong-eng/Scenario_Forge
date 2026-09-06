import type { LiveWorkspaceState } from './liveTypes';
import { hasExactApproval } from './workspacePanes';

import type { MessageKey } from '@/shared/i18n';
export const canvasSteps = ['structured', 'build', 'run'] as const;
export type CanvasStep = (typeof canvasSteps)[number];
export type CanvasStepState = 'locked' | 'available' | 'working' | 'complete' | 'failed';
export type CanvasPresentation = 'closed' | 'split' | 'fullscreen';

export type CanvasStepView = {
  id: CanvasStep;
  labelKey: MessageKey;
  state: CanvasStepState;
  reasonKey?: MessageKey;
};

export type WorkspaceLayoutPreference = {
  version: 2;
  canvasOpen: boolean;
  activeStep: CanvasStep;
  chatFraction: number;
  discoveredSteps: readonly CanvasStep[];
};

export type WorkspaceGuideState = {
  activeStep: CanvasStep;
  phase: 'working' | 'complete' | 'blocked';
  direction: 'backward' | 'still' | 'forward';
};

/** Chat remains primary while the artifact Canvas receives most of the split. */
export const builderRailDefaultFraction = 0.38;

const failedStatuses = new Set(['failed', 'failure', 'error', 'cancelled', 'canceled']);
const completeStatuses = new Set(['succeeded', 'success', 'completed', 'complete', 'passed']);

function normalizedStatus(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function deriveCanvasSteps(state: LiveWorkspaceState): CanvasStepView[] {
  const exactApproval = hasExactApproval(state.build, state.approval);
  const buildStatus = normalizedStatus(state.buildJob?.status);
  const runStatus = normalizedStatus(state.run?.status);

  const structured: CanvasStepView = state.selectedDefinition
    ? { id: 'structured', labelKey: 'canvas.step.structured', state: 'complete' }
    : { id: 'structured', labelKey: 'canvas.step.structured', state: 'locked', reasonKey: 'canvas.structuredLocked' };

  let build: CanvasStepView;
  if (!state.selectedDefinition) {
    build = { id: 'build', labelKey: 'canvas.step.build', state: 'locked', reasonKey: 'canvas.buildNeedsDefinition' };
  } else if (state.build) {
    build = exactApproval
      ? { id: 'build', labelKey: 'canvas.step.build', state: 'complete' }
      : { id: 'build', labelKey: 'canvas.step.build', state: 'available', reasonKey: 'canvas.buildAwaitingApproval' };
  } else if (state.buildJob && failedStatuses.has(buildStatus)) {
    build = { id: 'build', labelKey: 'canvas.step.build', state: 'failed', reasonKey: 'canvas.buildFailed' };
  } else if (state.buildJob) {
    build = { id: 'build', labelKey: 'canvas.step.build', state: 'working', reasonKey: 'canvas.buildWorking' };
  } else {
    build = { id: 'build', labelKey: 'canvas.step.build', state: 'locked', reasonKey: 'canvas.buildFromChat' };
  }

  let run: CanvasStepView;
  if (state.run) {
    if (failedStatuses.has(runStatus)) {
      run = { id: 'run', labelKey: 'canvas.step.run', state: 'failed', reasonKey: 'canvas.runFailed' };
    } else if (completeStatuses.has(runStatus)) {
      run = { id: 'run', labelKey: 'canvas.step.run', state: 'complete' };
    } else {
      run = { id: 'run', labelKey: 'canvas.step.run', state: 'working', reasonKey: 'canvas.runWorking' };
    }
  } else if (exactApproval) {
    run = { id: 'run', labelKey: 'canvas.step.run', state: 'available', reasonKey: 'canvas.runReady' };
  } else {
    run = { id: 'run', labelKey: 'canvas.step.run', state: 'locked', reasonKey: 'canvas.runNeedsApproval' };
  }

  return [structured, build, run];
}

export function nextAutoStep(state: LiveWorkspaceState, discoveredSteps: readonly CanvasStep[]): CanvasStep | null {
  const discovered = new Set(discoveredSteps);
  return [...deriveCanvasSteps(state)]
    .reverse()
    .find((step) => step.state !== 'locked' && !discovered.has(step.id))?.id ?? null;
}

export function applyCanvasMilestone(
  preference: WorkspaceLayoutPreference,
  step: CanvasStep,
  manuallyClosed: boolean,
): WorkspaceLayoutPreference {
  return {
    ...preference,
    canvasOpen: manuallyClosed ? preference.canvasOpen : true,
    activeStep: step,
    discoveredSteps: [...new Set([...preference.discoveredSteps, step])],
  };
}

/**
 * Locks everything after Structured once a Definition edit has outdated the
 * Build the later steps were derived from.
 *
 * The steps stay in the model rather than disappearing, so the operator can see
 * why they closed and what reopens them: the pipeline is walked again from the
 * step they can act on.
 */
export function supersedeDownstreamSteps(steps: readonly CanvasStepView[], superseded: boolean): CanvasStepView[] {
  if (!superseded) return [...steps];
  return steps.map((step) => step.id === 'structured' ? step : {
    ...step,
    state: 'locked' as const,
    reasonKey: step.id === 'build'
      ? 'canvas.buildSuperseded' as const
      : 'canvas.runNeedsMatchingBuild' as const,
  });
}

export function deriveWorkspaceGuideState(
  steps: readonly CanvasStepView[],
  activeStep: CanvasStep,
  previousStep: CanvasStep = activeStep,
): WorkspaceGuideState {
  const activeIndex = canvasSteps.indexOf(activeStep);
  const previousIndex = canvasSteps.indexOf(previousStep);
  const state = steps.find((step) => step.id === activeStep)?.state ?? 'locked';
  return {
    activeStep,
    phase: state === 'working' ? 'working' : state === 'locked' || state === 'failed' ? 'blocked' : 'complete',
    direction: activeIndex > previousIndex ? 'forward' : activeIndex < previousIndex ? 'backward' : 'still',
  };
}

export function layoutPreferenceKey(projectId: string, threadId: string) {
  return `scenario-forge:workspace-layout:v2:${projectId}:${threadId}`;
}

export function serializeWorkspaceLayoutPreference(preference: WorkspaceLayoutPreference) {
  return JSON.stringify(preference);
}

function isCanvasStep(value: unknown): value is CanvasStep {
  return typeof value === 'string' && canvasSteps.includes(value as CanvasStep);
}

function uniqueSteps(values: readonly unknown[]) {
  return [...new Set(values.filter(isCanvasStep))];
}

export function parseWorkspaceLayoutPreference(value: string | null): WorkspaceLayoutPreference | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.version === 2) {
      if (typeof parsed.canvasOpen !== 'boolean' || !isCanvasStep(parsed.activeStep)
        || typeof parsed.chatFraction !== 'number' || !Number.isFinite(parsed.chatFraction)
        || !Array.isArray(parsed.discoveredSteps) || !parsed.discoveredSteps.every(isCanvasStep)) return null;
      return {
        version: 2,
        canvasOpen: parsed.canvasOpen,
        activeStep: parsed.activeStep,
        chatFraction: Math.min(0.8, Math.max(0.2, parsed.chatFraction)),
        discoveredSteps: uniqueSteps(parsed.discoveredSteps),
      };
    }

    if (typeof parsed.open !== 'boolean' || !Array.isArray(parsed.discovered)) return null;
    const migrate = (pane: unknown): CanvasStep | null => {
      if (pane === 'definition') return 'structured';
      if (pane === 'approval') return 'build';
      return isCanvasStep(pane) ? pane : null;
    };
    const migratedActive = migrate(parsed.active) ?? 'structured';
    const migratedDiscovered = uniqueSteps(parsed.discovered.map(migrate));
    const legacyUtility = parsed.active === 'agent' || parsed.active === 'capabilities';
    return {
      version: 2,
      canvasOpen: legacyUtility ? false : parsed.open,
      activeStep: migratedActive,
      chatFraction: builderRailDefaultFraction,
      discoveredSteps: migratedDiscovered,
    };
  } catch {
    return null;
  }
}

export function resolveSplitLayout(containerWidth: number, requestedFraction: number) {
  const minimumChat = 320;
  const splitterWidth = 9;
  const minimumCanvas = 640;
  const minimumDesktopWidth = minimumChat + splitterWidth + minimumCanvas;
  if (containerWidth < minimumDesktopWidth) {
    return {
      compact: true,
      chatFraction: builderRailDefaultFraction,
      chatPixels: Math.round(containerWidth * builderRailDefaultFraction),
      minimumChat: 0,
      maximumChat: 0,
    };
  }
  const maximumChat = Math.max(minimumChat, Math.min(Math.floor(containerWidth / 2), containerWidth - splitterWidth - minimumCanvas));
  const requestedPixels = containerWidth * requestedFraction;
  const chatPixels = Math.round(Math.min(maximumChat, Math.max(minimumChat, requestedPixels)));
  return { compact: false, chatFraction: chatPixels / containerWidth, chatPixels, minimumChat, maximumChat };
}
