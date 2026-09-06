import { describe, expect, it } from 'vitest';
import {
  isWorkerDepartureClip,
  isWorkerTransitionClip,
  isWorkerTravel,
  minimumTravelPx,
  resolveWorkerDeparture,
  resolveWorkerGuidePresentation,
  resolveWorkerSpriteClip,
  shouldAdvanceWorkerSprite,
  workerSpriteAtlases,
  workerSpriteBox,
  workerSpriteCell,
  workerSpriteBackgroundPosition,
  workerSpriteBackgroundSize,
  workerSpriteDisplaySize,
  workerSpriteFrame,
  workerSpriteStaticFrame,
  resolveWorkerTransition,
  resolveWorkerUnwind,
  sliceWorkerClip,
  workerClipDurationMs,
  workerTravelDuration,
} from '../../../src/components/forge/workspaceWorkerSprite';
import type { WorkspaceGuideState } from '../../../src/components/forge/workspaceCanvasModel';

const atlases = workerSpriteAtlases({
  runAtlasSrc: '/forge/guide/worker-run-v2.webp',
  transitionAtlasSrc: '/forge/guide/worker-transitions-v1.webp',
});

const guide = (overrides: Partial<WorkspaceGuideState> = {}): WorkspaceGuideState => ({
  activeStep: 'structured',
  phase: 'complete',
  direction: 'still',
  ...overrides,
});

describe('worker guide presentation choreography', () => {
  it('keeps Run in a loop until a terminal result exists', () => {
    expect(resolveWorkerGuidePresentation({ activeStep: 'run', phase: 'working', direction: 'still' }, false, false)).toMatchObject({ clip: 'run', mode: 'loop' });
    expect(resolveWorkerGuidePresentation({ activeStep: 'run', phase: 'complete', direction: 'still' }, false, true)).toMatchObject({ clip: 'crossed_arms', mode: 'hold' });
  });

  it('reviews with clipboard after returning from a completed Run', () => {
    expect(resolveWorkerGuidePresentation({ activeStep: 'structured', phase: 'complete', direction: 'backward' }, false, true)).toMatchObject({ clip: 'review_clipboard', mode: 'hold' });
    expect(resolveWorkerGuidePresentation({ activeStep: 'build', phase: 'working', direction: 'forward' }, true, true)).toMatchObject({ clip: 'run', mode: 'loop' });
  });

  it('reviews on any non-Run tab, whichever way the worker got there', () => {
    // The clipboard used to require `direction === 'backward'`, a value that
    // only survives until the next render, so in the app it usually never
    // appeared. Arrival at a non-Run tab is what actually means "reviewing".
    for (const direction of ['backward', 'still', 'forward'] as const) {
      expect(resolveWorkerGuidePresentation(guide({ activeStep: 'structured', direction }), false, true).clip).toBe('review_clipboard');
      expect(resolveWorkerGuidePresentation(guide({ activeStep: 'build', direction }), false, true).clip).toBe('review_clipboard');
    }
    // Nothing changes while no terminal Run exists, or while a step is working.
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'structured' }), false, false).clip).toBe('point');
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'build', phase: 'working' }), false, true).clip).toBe('run');
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'build', phase: 'blocked' }), false, true).clip).toBe('blocked');
  });
});

describe('worker sprite clock', () => {
  it('walks the approved 12-frame cycle at 12fps and wraps after one second', () => {
    const run = atlases.run;
    expect([run.frameCount, run.fps, run.columns]).toEqual([12, 12, 6]);
    expect([run.frameWidth, run.frameHeight]).toEqual([320, 448]);
    expect(workerSpriteFrame(run, 0)).toBe(0);
    expect(workerSpriteFrame(run, 83)).toBe(0);
    expect(workerSpriteFrame(run, 84)).toBe(1);
    expect(workerSpriteFrame(run, 500)).toBe(6);
    expect(workerSpriteFrame(run, 999)).toBe(11);
    expect(workerSpriteFrame(run, 1000)).toBe(0);
    expect(workerSpriteFrame(run, 1084)).toBe(1);
  });

  it('holds a settled pose on its single frame however long it is shown', () => {
    expect(atlases.point.playback).toBe('hold');
    expect(atlases.point.frameCount).toBe(1);
    expect(workerSpriteFrame(atlases.point, 10_000)).toBe(0);
    expect(workerSpriteFrame(atlases.success, 10_000)).toBe(0);
  });

  it('ignores unusable elapsed time', () => {
    expect(workerSpriteFrame(atlases.run, -50)).toBe(0);
    expect(workerSpriteFrame(atlases.run, Number.NaN)).toBe(0);
  });
});

describe('worker sprite atlas geometry', () => {
  it('fits the 320x448 cell into the approved 117x126 guide box by height', () => {
    expect(workerSpriteBox).toEqual({ width: 117, height: 126 });
    expect(workerSpriteDisplaySize(atlases.run)).toEqual({ width: 90, height: 126 });
  });

  it('maps every frame to its absolute cell in the sheet', () => {
    expect(workerSpriteCell(atlases.run, 0)).toEqual({ column: 0, row: 0 });
    expect(workerSpriteCell(atlases.run, 5)).toEqual({ column: 5, row: 0 });
    expect(workerSpriteCell(atlases.run, 6)).toEqual({ column: 0, row: 1 });
    expect(workerSpriteCell(atlases.run, 11)).toEqual({ column: 5, row: 1 });

    // A hold clip has frameCount 1 but still addresses its absolute cell in the
    //6x4 transition sheet, so the pose it lands on is the one it turned into.
    expect(workerSpriteCell(atlases.review_clipboard, 0)).toEqual({ column: 1, row: 2 });
    expect(workerSpriteBackgroundPosition(atlases.review_clipboard, 0)).toBe('-90px -252px');
    expect(workerSpriteBackgroundSize(atlases.run)).toBe('540px auto');
  });

  it('never samples outside its own clip when a frame index overruns', () => {
    expect(workerSpriteCell(atlases.run, 99)).toEqual({ column: 5, row: 1 });
    expect(workerSpriteCell(atlases.point, 99)).toEqual({ column: 0, row: 0 });
  });

  it('keeps one display geometry across both atlases so nothing resizes mid-clip', () => {
    for (const atlas of Object.values(atlases)) {
      expect([atlas.frameWidth, atlas.frameHeight]).toEqual([320, 448]);
      expect(workerSpriteDisplaySize(atlas)).toEqual({ width: 90, height: 126 });
    }
  });
});

describe('guide state to sprite clip', () => {
  it('runs whenever Motion is carrying the worker to another tab', () => {
    expect(resolveWorkerSpriteClip(guide({ activeStep: 'run', phase: 'complete' }), true)).toBe('run');
    expect(resolveWorkerSpriteClip(guide({ activeStep: 'build', phase: 'blocked' }), true)).toBe('run');
  });

  it('runs while a step is working and holds a pose once it has arrived', () => {
    expect(resolveWorkerSpriteClip(guide({ activeStep: 'build', phase: 'working' }))).toBe('run');
    expect(resolveWorkerSpriteClip(guide({ activeStep: 'structured', phase: 'complete' }))).toBe('point');
    expect(resolveWorkerSpriteClip(guide({ activeStep: 'build', phase: 'complete' }))).toBe('point');
    expect(resolveWorkerSpriteClip(guide({ activeStep: 'run', phase: 'complete' }))).toBe('success');
    expect(resolveWorkerSpriteClip(guide({ activeStep: 'run', phase: 'blocked' }))).toBe('blocked');
  });
});

describe('worker travel', () => {
  it('runs for a real journey and slides quietly for a measurement nudge', () => {
    expect(minimumTravelPx).toBe(24);
    expect(isWorkerTravel(48, 248)).toBe(true);
    expect(isWorkerTravel(248, 48)).toBe(true);
    expect(isWorkerTravel(100, 124)).toBe(true);
    // Lane re-measurement settles by a few px after fonts and the split layout
    // land; that must not read as the worker sprinting on the spot.
    expect(isWorkerTravel(100, 103)).toBe(false);
    expect(isWorkerTravel(100, 100)).toBe(false);
    expect(isWorkerTravel(100, 77)).toBe(false);
  });

  it('buys speed with distance so a long cross never drags', () => {
    // Every cross starts from the same base, then distance adds time slowly:
    // 100px runs at ~167px/s, 600px at ~545px/s.
    expect(workerTravelDuration(100)).toBeCloseTo(0.6, 3);
    expect(workerTravelDuration(-100)).toBeCloseTo(0.6, 3);
    expect(workerTravelDuration(600)).toBeCloseTo(1.1, 3);
    expect(workerTravelDuration(30)).toBe(0.55);
    expect(workerTravelDuration(4000)).toBe(1.2);
  });
});

describe('worker sprite playback gating', () => {
  it('picks a representative static frame for reduced motion', () => {
    expect(workerSpriteStaticFrame(atlases.run)).toBe(0);
    expect(workerSpriteStaticFrame(atlases.point)).toBe(0);
  });

  it('stops the frame clock for reduced motion, hidden documents and offscreen lanes', () => {
    expect(shouldAdvanceWorkerSprite(false, false, true)).toBe(true);
    expect(shouldAdvanceWorkerSprite(true, false, true)).toBe(false);
    expect(shouldAdvanceWorkerSprite(false, true, true)).toBe(false);
    expect(shouldAdvanceWorkerSprite(false, false, false)).toBe(false);
  });
});


describe('front-facing transitions', () => {
  it('lays the three bridges out in the transition atlas, each ending on its hold pose', () => {
    expect(atlases.to_crossed_arms).toMatchObject({
      src: '/forge/guide/worker-transitions-v1.webp', columns: 6,
      firstFrame: 0, frameCount: 7, fps: 8, playback: 'once',
    });
    expect(atlases.to_review).toMatchObject({ firstFrame: 7, frameCount: 7, fps: 8, playback: 'once' });
    expect(atlases.to_run).toMatchObject({ firstFrame: 14, frameCount: 7, fps: 8, playback: 'once' });
    // Folded arms have nothing to stow, so that departure skips the two
    // clipboard frames and starts where the body squares up.
    expect(atlases.to_run_from_stand).toMatchObject({ firstFrame: 16, frameCount: 5, fps: 8, playback: 'once' });

    // Each hold is the final frame of the bridge that arrives at it, so the
    // pose does not jump when the one-shot finishes.
    expect(atlases.crossed_arms).toMatchObject({ firstFrame: 6, frameCount: 1, playback: 'hold' });
    expect(atlases.review_clipboard).toMatchObject({ firstFrame: 13, frameCount: 1, playback: 'hold' });
    expect(atlases.crossed_arms.src).toBe('/forge/guide/worker-transitions-v1.webp');
  });

  it('bridges only where art exists, and never interrupts a bridge already playing', () => {
    expect(resolveWorkerTransition('run', 'crossed_arms')).toBe('to_crossed_arms');
    expect(resolveWorkerTransition('point', 'review_clipboard')).toBe('to_review');
    expect(resolveWorkerTransition('review_clipboard', 'run')).toBe('to_run');
    expect(resolveWorkerTransition('crossed_arms', 'run')).toBe('to_run_from_stand');
    expect(resolveWorkerDeparture('review_clipboard')).toBe('to_run');
    expect(resolveWorkerDeparture('crossed_arms')).toBe('to_run_from_stand');
    // A profile pose already faces the way it travels and leaves at once.
    expect(resolveWorkerDeparture('point')).toBeNull();
    expect(resolveWorkerDeparture('run')).toBeNull();

    expect(resolveWorkerTransition('run', 'run')).toBeNull();
    expect(resolveWorkerTransition('run', 'point')).toBeNull();
    expect(resolveWorkerTransition('point', 'run')).toBeNull();
    expect(resolveWorkerTransition('point', 'blocked')).toBeNull();
    expect(resolveWorkerTransition('to_review', 'review_clipboard')).toBeNull();
    expect(resolveWorkerTransition('to_run', 'run')).toBeNull();
  });

  it('knows which clips are bridges and how long each takes', () => {
    expect(isWorkerTransitionClip('to_review')).toBe(true);
    expect(isWorkerTransitionClip('review_clipboard')).toBe(false);
    expect(isWorkerTransitionClip('run')).toBe(false);

    expect(workerClipDurationMs(atlases.to_crossed_arms)).toBe(875);
    expect(workerClipDurationMs(atlases.to_run)).toBe(875);
    expect(workerClipDurationMs(atlases.to_run_from_stand)).toBe(625);
    expect(workerClipDurationMs(atlases.crossed_arms)).toBe(1000);
  });

  it('walks a bridge one frame at a time at its own cadence', () => {
    expect(workerSpriteFrame(atlases.to_review, 0)).toBe(0);
    expect(workerSpriteFrame(atlases.to_review, 130)).toBe(1);
    expect(workerSpriteFrame(atlases.to_review, 800)).toBe(6);
    // A one-shot clamps on its final frame instead of wrapping.
    expect(workerSpriteFrame(atlases.to_review, 9_000)).toBe(6);
    expect(workerSpriteCell(atlases.to_review, 6)).toEqual({ column: 1, row: 2 });
  });
});


describe('work still waiting somewhere in the pipeline', () => {
  it('keeps running after arriving, instead of standing about', () => {
    // `phase` describes the active step alone and folds "available" into
    // "complete", so the pending flag is what tells an unfinished pipeline from
    // a finished one -- including a completed Structured with nothing built.
    const pending = guide({ activeStep: 'structured' });
    expect(resolveWorkerGuidePresentation(pending, false, false, true)).toMatchObject({ clip: 'run', mode: 'loop' });
    expect(resolveWorkerGuidePresentation(pending, false, false, false)).toMatchObject({ clip: 'point', mode: 'hold' });
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'build' }), false, false, true).clip).toBe('run');

    // A finished Run settles whatever the rest of the pipeline reads as: after
    // a reload there is no approval in state, so Build is merely "available",
    // and that must not keep the worker running past a finished Run.
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'run' }), false, true, false).clip).toBe('crossed_arms');
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'run' }), false, true, true).clip).toBe('crossed_arms');
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'structured' }), false, true, true).clip).toBe('review_clipboard');

    // Blocked outranks pending: a locked step is not work in progress.
    expect(resolveWorkerGuidePresentation(guide({ activeStep: 'run', phase: 'blocked' }), false, false, true).clip).toBe('blocked');
  });
});

describe('unwinding an interrupted turn', () => {
  it('rotates back out from the angle the arrival turn had reached', () => {
    // The departure runs the same angles in reverse, so an early interrupt has
    // barely any turn left to undo and a late one has the whole rotation.
    expect(resolveWorkerUnwind('to_review', 0)).toEqual({ clip: 'to_run_from_stand', skip: 4 });
    expect(resolveWorkerUnwind('to_crossed_arms', 2)).toEqual({ clip: 'to_run_from_stand', skip: 2 });
    expect(resolveWorkerUnwind('to_crossed_arms', 4)).toEqual({ clip: 'to_run_from_stand', skip: 0 });
    // Past the rotation the arms are already folded: still a full turn back.
    expect(resolveWorkerUnwind('to_crossed_arms', 6)).toEqual({ clip: 'to_run_from_stand', skip: 0 });
    // But once the clipboard is out it has to be stowed, hurry or not.
    expect(resolveWorkerUnwind('to_review', 6)).toEqual({ clip: 'to_run', skip: 0 });

    // Only arrival turns unwind; a departure is already heading the right way.
    expect(resolveWorkerUnwind('to_run', 1)).toBeNull();
    expect(resolveWorkerUnwind('run', 1)).toBeNull();
    expect(isWorkerDepartureClip('to_run_from_stand')).toBe(true);
    expect(isWorkerDepartureClip('to_review')).toBe(false);
  });

  it('slices a clip to its tail so it can be entered part-way through', () => {
    const full = atlases.to_run_from_stand;
    expect(sliceWorkerClip(full, 0)).toBe(full);
    expect(sliceWorkerClip(full, 2)).toMatchObject({ firstFrame: full.firstFrame + 2, frameCount: 3 });
    // The tail is always at least one frame, whatever is asked for.
    expect(sliceWorkerClip(full, 99)).toMatchObject({ firstFrame: full.firstFrame + 4, frameCount: 1 });
    expect(workerClipDurationMs(sliceWorkerClip(full, 2))).toBe(375);
  });
});
