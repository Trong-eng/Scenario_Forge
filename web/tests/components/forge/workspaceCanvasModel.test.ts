import { describe, expect, it } from 'vitest';
import {
  applyCanvasMilestone,
  deriveCanvasSteps,
  deriveWorkspaceGuideState,
  builderRailDefaultFraction,
  layoutPreferenceKey,
  nextAutoStep,
  supersedeDownstreamSteps,
  parseWorkspaceLayoutPreference,
  resolveSplitLayout,
  serializeWorkspaceLayoutPreference,
} from '../../../src/components/forge/workspaceCanvasModel';
import type { CanvasStepView } from '../../../src/components/forge/workspaceCanvasModel';
import type { LiveWorkspaceState } from '../../../src/components/forge/liveTypes';

const state = (overrides: Partial<LiveWorkspaceState> = {}): LiveWorkspaceState => ({
  session: null,
  stage: 'ready',
  status: 'ready',
  runEvidencePending: false,
  error: null,
  recovery: null,
  definitions: [],
  registry: [],
  selectedDefinition: null,
  variant: null,
  buildJob: null,
  build: null,
  approval: null,
  run: null,
  evaluation: null,
  artifacts: [],
  artifactOutcomes: [],
  ...overrides,
});

const definition = { definition: { definition_id: 'definition-1' } } as never;
const build = { build_id: 'build-1', manifest_hash: 'sha256:manifest-1' } as never;
const approval = {
  approval_id: 'approval-1', decision: 'approved', invalidated: false,
  build_id: 'build-1', manifest_hash: 'sha256:manifest-1',
} as never;

describe('workspace Canvas state', () => {
  it('keeps every step visible while locking unavailable work', () => {
    expect(deriveCanvasSteps(state())).toEqual([
      { id: 'structured', labelKey: 'canvas.step.structured', state: 'locked', reasonKey: 'canvas.structuredLocked' },
      { id: 'build', labelKey: 'canvas.step.build', state: 'locked', reasonKey: 'canvas.buildNeedsDefinition' },
      { id: 'run', labelKey: 'canvas.step.run', state: 'locked', reasonKey: 'canvas.runNeedsApproval' },
    ]);
  });

  it('moves Build from working to approval-required to complete', () => {
    expect(deriveCanvasSteps(state({ selectedDefinition: definition, buildJob: { status: 'running' } as never }))[1]?.state).toBe('working');
    expect(deriveCanvasSteps(state({ selectedDefinition: definition, build }))[1]).toEqual({
      id: 'build', labelKey: 'canvas.step.build', state: 'available', reasonKey: 'canvas.buildAwaitingApproval',
    });
    expect(deriveCanvasSteps(state({ selectedDefinition: definition, build, approval }))[1]?.state).toBe('complete');
  });

  it('fails Build and Run from provider terminal status without unlocking the next step', () => {
    const failedBuild = deriveCanvasSteps(state({
      selectedDefinition: definition,
      buildJob: { status: 'failed' } as never,
    }));
    expect(failedBuild[1]?.state).toBe('failed');
    expect(failedBuild[2]?.state).toBe('locked');

    const failedRun = deriveCanvasSteps(state({
      selectedDefinition: definition,
      build,
      approval,
      run: { status: 'failed' } as never,
    }));
    expect(failedRun[2]).toEqual({ id: 'run', labelKey: 'canvas.step.run', state: 'failed', reasonKey: 'canvas.runFailed' });
  });

  it('selects only the most advanced newly available step', () => {
    expect(nextAutoStep(state({ selectedDefinition: definition }), [])).toBe('structured');
    expect(nextAutoStep(state({ selectedDefinition: definition, build }), ['structured'])).toBe('build');
    expect(nextAutoStep(state({ selectedDefinition: definition, build, approval }), ['structured', 'build'])).toBe('run');
    expect(nextAutoStep(state({ selectedDefinition: definition, build, approval }), ['structured', 'build', 'run'])).toBeNull();
  });

  it('records later milestones without reopening a Canvas the user closed', () => {
    const closed = {
      version: 2 as const,
      canvasOpen: false,
      activeStep: 'structured' as const,
      chatFraction: 0.38,
      discoveredSteps: ['structured'] as const,
    };
    expect(applyCanvasMilestone(closed, 'build', true)).toEqual({
      ...closed,
      activeStep: 'build',
      discoveredSteps: ['structured', 'build'],
    });
    expect(applyCanvasMilestone(closed, 'build', false)).toEqual({
      ...closed,
      canvasOpen: true,
      activeStep: 'build',
      discoveredSteps: ['structured', 'build'],
    });
  });

  it('derives a future character hook from active step and direction', () => {
    const steps = deriveCanvasSteps(state({ selectedDefinition: definition, build, approval }));
    expect(deriveWorkspaceGuideState(steps, 'run', 'build')).toEqual({ activeStep: 'run', phase: 'complete', direction: 'forward' });
    expect(deriveWorkspaceGuideState(steps, 'structured', 'run')).toEqual({ activeStep: 'structured', phase: 'complete', direction: 'backward' });
  });
});

describe('workspace layout preference', () => {
  it('round-trips versioned layout state under a thread-scoped key', () => {
    const value = {
      version: 2 as const,
      canvasOpen: false,
      activeStep: 'build' as const,
      chatFraction: 0.41,
      discoveredSteps: ['structured', 'build'] as const,
    };
    expect(parseWorkspaceLayoutPreference(serializeWorkspaceLayoutPreference(value))).toEqual(value);
    expect(layoutPreferenceKey('project-a', 'thread-a')).toBe('scenario-forge:workspace-layout:v2:project-a:thread-a');
  });

  it('migrates legacy Definition and refuses to auto-open legacy Capabilities', () => {
    expect(parseWorkspaceLayoutPreference(JSON.stringify({ active: 'definition', open: true, discovered: ['definition'] }))).toEqual({
      version: 2, canvasOpen: true, activeStep: 'structured', chatFraction: 0.38, discoveredSteps: ['structured'],
    });
    expect(parseWorkspaceLayoutPreference(JSON.stringify({ active: 'capabilities', open: true, discovered: [] }))).toEqual({
      version: 2, canvasOpen: false, activeStep: 'structured', chatFraction: 0.38, discoveredSteps: [],
    });
    expect(parseWorkspaceLayoutPreference('{broken')).toBeNull();
  });

  it('defaults to 38/62 while allowing an equal Chat / Canvas split', () => {
    expect(builderRailDefaultFraction).toBe(0.38);
    expect(resolveSplitLayout(1440, builderRailDefaultFraction)).toEqual({ compact: false, chatFraction: 547 / 1440, chatPixels: 547, minimumChat: 320, maximumChat: 720 });
    expect(resolveSplitLayout(1440, 0.25)).toEqual({ compact: false, chatFraction: 0.25, chatPixels: 360, minimumChat: 320, maximumChat: 720 });
    expect(resolveSplitLayout(1440, 0.1)).toEqual({ compact: false, chatFraction: 320 / 1440, chatPixels: 320, minimumChat: 320, maximumChat: 720 });
    expect(resolveSplitLayout(1440, 0.9)).toEqual({ compact: false, chatFraction: 0.5, chatPixels: 720, minimumChat: 320, maximumChat: 720 });
    expect(resolveSplitLayout(1000, 0.5)).toEqual({ compact: false, chatFraction: 0.351, chatPixels: 351, minimumChat: 320, maximumChat: 351 });
    expect(resolveSplitLayout(968, 0.25)).toEqual({ compact: true, chatFraction: 0.38, chatPixels: 368, minimumChat: 0, maximumChat: 0 });
    expect(resolveSplitLayout(969, 0.25)).toEqual({ compact: false, chatFraction: 320 / 969, chatPixels: 320, minimumChat: 320, maximumChat: 320 });
  });
});

describe('a Definition edit outdating what came after it', () => {
  const built: CanvasStepView[] = [
    { id: 'structured', labelKey: 'canvas.step.structured', state: 'complete' },
    { id: 'build', labelKey: 'canvas.step.build', state: 'complete' },
    { id: 'run', labelKey: 'canvas.step.run', state: 'complete' },
  ];

  it('locks every step after Structured, and says what reopens it', () => {
    const steps = supersedeDownstreamSteps(built, true);

    // Structured is the step the operator can still act on, so it stays open.
    expect(steps[0]).toEqual({ id: 'structured', labelKey: 'canvas.step.structured', state: 'complete' });
    expect(steps[1]).toMatchObject({ id: 'build', state: 'locked' });
    expect(steps[2]).toMatchObject({ id: 'run', state: 'locked' });
    // A locked step without a reason is a dead end; both carry the way out.
    expect(steps[1]?.reasonKey).toBe('canvas.buildSuperseded');
    expect(steps[2]?.reasonKey).toBe('canvas.runNeedsMatchingBuild');
  });

  it('leaves the pipeline alone while the Build still matches', () => {
    expect(supersedeDownstreamSteps(built, false)).toEqual(built);
  });
});
