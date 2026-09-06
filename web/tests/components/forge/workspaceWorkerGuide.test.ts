import { describe, expect, it } from 'vitest';
import {
  deriveWorkerGuideInputs,
  resolveWorkerGuidePosition,
  shouldPlayWorkerGuide,
  type GuideRunProgress,
} from '../../../src/components/forge/workspaceWorkerGuide';
import type { WorkspaceGuideState } from '../../../src/components/forge/workspaceCanvasModel';
import { shouldRenderWorkspaceWorkerGuide } from '../../../src/components/forge/workspaceWorkerGuideAsset';

const guide = (overrides: Partial<WorkspaceGuideState> = {}): WorkspaceGuideState => ({
  activeStep: 'structured',
  phase: 'complete',
  direction: 'still',
  ...overrides,
});

describe('workspace worker guide adapter', () => {
  it('keeps Build progress unknown while reporting an honest Run fraction', () => {
    expect(deriveWorkerGuideInputs(guide({ activeStep: 'build', phase: 'working', direction: 'forward' }))).toEqual({
      stepIndex: 1,
      direction: 1,
      progress: -1,
      reducedMotion: false,
    });

    const progress: GuideRunProgress = { completedSteps: 3, totalSteps: 6 };
    expect(deriveWorkerGuideInputs(guide({ activeStep: 'run', phase: 'working', direction: 'forward' }), progress)).toEqual({
      stepIndex: 2,
      direction: 1,
      progress: 0.5,
      reducedMotion: false,
    });
  });

  it('clamps honest Run progress and falls back to unknown when its denominator is unusable', () => {
    expect(deriveWorkerGuideInputs(guide({ activeStep: 'run', phase: 'working' }), { completedSteps: 9, totalSteps: 6 }).progress).toBe(1);
    expect(deriveWorkerGuideInputs(guide({ activeStep: 'run', phase: 'working' }), { completedSteps: -1, totalSteps: 6 }).progress).toBe(0);
    expect(deriveWorkerGuideInputs(guide({ activeStep: 'run', phase: 'working' }), { completedSteps: 0, totalSteps: 0 }).progress).toBe(-1);
  });

  it('reports the travel direction that Motion uses, without a Rive pose channel', () => {
    expect(deriveWorkerGuideInputs(guide({ activeStep: 'structured', phase: 'complete', direction: 'backward' })).direction).toBe(-1);
    expect(deriveWorkerGuideInputs(guide({ activeStep: 'run', phase: 'blocked' })).direction).toBe(0);
  });

  it('stands centred on the step it reports, whatever the progress', () => {
    const bounds = {
      structured: { left: 0, right: 200 },
      build: { left: 200, right: 400 },
      run: { left: 400, right: 600 },
    };
    expect(resolveWorkerGuidePosition(guide({ activeStep: 'build' }), bounds, 600, 100)).toBe(250);
    // Progress no longer slides the worker across the Run tab. A queued run
    // parked it at the tab's left edge, which read as a misplaced sprite, and
    // the steps were too small to turn it to face the way it was moving.
    for (const progress of [0, 0.5, 1]) {
      expect(resolveWorkerGuidePosition(guide({ activeStep: 'run', phase: 'working' }), bounds, 600, 100, progress)).toBe(450);
    }
    // A lane narrower than the tab still clamps the worker inside it.
    expect(resolveWorkerGuidePosition(guide({ activeStep: 'run', phase: 'working' }), bounds, 440, 100, 1)).toBe(340);
  });

  it('stops playback for reduced motion, hidden tabs, and offscreen lanes', () => {
    expect(shouldPlayWorkerGuide(false, false, true)).toBe(true);
    expect(shouldPlayWorkerGuide(true, false, true)).toBe(false);
    expect(shouldPlayWorkerGuide(false, true, true)).toBe(false);
    expect(shouldPlayWorkerGuide(false, false, false)).toBe(false);
  });

  it('never enables the worker guide in compact/mobile Canvas', () => {
    expect(shouldRenderWorkspaceWorkerGuide(true, true)).toBe(true);
    expect(shouldRenderWorkspaceWorkerGuide(true, false)).toBe(false);
    expect(shouldRenderWorkspaceWorkerGuide(false, true)).toBe(false);
  });
});
