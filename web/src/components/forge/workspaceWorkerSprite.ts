import type { WorkspaceGuideState } from './workspaceCanvasModel';

/**
 * SF-036 replaced the 20-frame v1 sheet with the approved 12-pose run cycle.
 * Motion still owns horizontal travel; this module owns only which cell of the
 * atlas is visible at a given moment.
 */
export type WorkerSpriteClip =
  | 'idle' | 'run' | 'point' | 'review' | 'blocked' | 'success'
  | 'crossed_arms' | 'review_clipboard'
  // One-shot bridges between the profile run loop and the front-facing holds.
  | 'to_crossed_arms' | 'to_review' | 'to_run' | 'to_run_from_stand';

export type WorkerGuidePresentation = {
  clip: WorkerSpriteClip;
  mode: 'loop' | 'hold';
};

export type WorkerSpriteAtlas = {
  src: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  firstFrame: number;
  frameCount: number;
  fps: number;
  playback: 'loop' | 'once' | 'hold';
};

export type WorkerSpriteSources = {
  runAtlasSrc: string;
  transitionAtlasSrc: string;
};

/**
 * The guide lane reserves 117x126; a 320x448 cell is fitted by height to 90x126.
 * The height is a multiple of 7 on purpose: the cell is exactly 5:7, so the
 * painted width comes out whole and each atlas row lands on an exact multiple
 * of the display height -- no neighbouring cell can bleed into view.
 */
export const workerSpriteBox = { width: 117, height: 126 } as const;

const runCell = { frameWidth: 320, frameHeight: 448 } as const;

/**
 * Transition atlas layout, 6 columns of the same 320x448 cell:
 * frames 0-6 turn out of the run into crossed arms, 7-13 turn out into the
 * clipboard review, 14-20 stow the clipboard and turn back to profile. Each
 * sequence ends on the pose the next hold uses, so nothing snaps at the seam.
 */
const transitionLayout = {
  toCrossedArms: { firstFrame: 0, frameCount: 7, fps: 8 },
  toReview: { firstFrame: 7, frameCount: 7, fps: 8 },
  toRun: { firstFrame: 14, frameCount: 7, fps: 8 },
  // The same departure without its two clipboard frames: a worker with folded
  // arms has nothing to stow, so it starts where the body squares up.
  toRunFromStand: { firstFrame: 16, frameCount: 5, fps: 8 },
} as const;

/**
 * The one frame the worker holds while a step is settled. Frame 0 is the
 * right-foot contact pose: both feet are near the ground and the torso is
 * upright, so it reads as standing rather than frozen mid-air.
 */
const standFrame = 0;

/**
 * Every clip is cut from the run atlas. The v1 pose sheet is deliberately not
 * mixed in: it was drawn at a different body scale, so settling on it would
 * resize the character exactly where SF-036 removed that pulse.
 */
export function workerSpriteAtlases(sources: WorkerSpriteSources): Record<WorkerSpriteClip, WorkerSpriteAtlas> {
  // Twenty authored poses are packed six across, so the shipped sheet has
  // four rows (the final row contains the remaining two poses).
  const run = { ...runCell, src: sources.runAtlasSrc, columns: 6 } as const;
  const stand = { ...run, firstFrame: standFrame, frameCount: 1, fps: 1, playback: 'hold' } as const;
  const transition = { ...runCell, src: sources.transitionAtlasSrc, columns: 6 } as const;
  const hold = (firstFrame: number) => ({ ...transition, firstFrame, frameCount: 1, fps: 1, playback: 'hold' } as const);
  const lastFrame = (clip: { firstFrame: number; frameCount: number }) => clip.firstFrame + clip.frameCount - 1;
  return {
    run: { ...run, firstFrame: 0, frameCount: 12, fps: 12, playback: 'loop' },
    idle: stand,
    point: stand,
    review: stand,
    blocked: stand,
    success: stand,
    to_crossed_arms: { ...transition, ...transitionLayout.toCrossedArms, playback: 'once' },
    crossed_arms: hold(lastFrame(transitionLayout.toCrossedArms)),
    to_review: { ...transition, ...transitionLayout.toReview, playback: 'once' },
    review_clipboard: hold(lastFrame(transitionLayout.toReview)),
    to_run: { ...transition, ...transitionLayout.toRun, playback: 'once' },
    to_run_from_stand: { ...transition, ...transitionLayout.toRunFromStand, playback: 'once' },
  };
}

const transitionClips = ['to_crossed_arms', 'to_review', 'to_run', 'to_run_from_stand'] as const;

/**
 * The turn a worker owes before it may start running. Front-facing holds have
 * to square up and rotate back to profile first; a profile pose already faces
 * the way it travels and leaves immediately.
 */
export function resolveWorkerDeparture(clip: WorkerSpriteClip): WorkerSpriteClip | null {
  if (clip === 'review_clipboard') return 'to_run';
  if (clip === 'crossed_arms') return 'to_run_from_stand';
  return null;
}

export function isWorkerDepartureClip(clip: WorkerSpriteClip) {
  return clip === 'to_run' || clip === 'to_run_from_stand';
}

/** The first five frames of an arrival turn are the profile -> front rotation. */
const arrivalTurnFrames = 5;

/**
 * What to play when a tab is clicked while the worker is still turning to face
 * the viewer. The arrival turn is unwound from wherever it got to rather than
 * abandoned: the departure clip runs the same angles in reverse, so frame `i`
 * of the turn matches frame `arrivalTurnFrames - 1 - i` of the departure, and
 * the worker rotates back out from exactly the angle it had reached.
 *
 * Without this the worker kept its front-facing frames while the lane carried
 * it sideways -- the crab walk.
 */
export function resolveWorkerUnwind(clip: WorkerSpriteClip, frame: number): { clip: WorkerSpriteClip; skip: number } | null {
  if (clip !== 'to_crossed_arms' && clip !== 'to_review') return null;
  // Past the turn, the review clip has the clipboard out; that has to be stowed
  // whatever the hurry, so the full departure plays.
  if (clip === 'to_review' && frame >= 6) return { clip: 'to_run', skip: 0 };
  const turned = Math.min(Math.max(frame, 0), arrivalTurnFrames - 1);
  return { clip: 'to_run_from_stand', skip: arrivalTurnFrames - 1 - turned };
}

/** The tail of a clip, for entering one part-way through. */
export function sliceWorkerClip(atlas: WorkerSpriteAtlas, skip: number): WorkerSpriteAtlas {
  if (skip <= 0) return atlas;
  const frameCount = Math.max(1, atlas.frameCount - skip);
  return { ...atlas, firstFrame: atlas.firstFrame + (atlas.frameCount - frameCount), frameCount };
}

export function isWorkerTransitionClip(clip: WorkerSpriteClip) {
  return (transitionClips as readonly string[]).includes(clip);
}

/**
 * The bridge to play before a target pose, or null when the change needs none.
 * Bridges exist only between the run loop and the two front-facing holds; every
 * other change is a straight cut, because no art covers it.
 */
export function resolveWorkerTransition(from: WorkerSpriteClip, to: WorkerSpriteClip): WorkerSpriteClip | null {
  if (from === to || isWorkerTransitionClip(from)) return null;
  if (to === 'crossed_arms') return 'to_crossed_arms';
  if (to === 'review_clipboard') return 'to_review';
  // Leaving a front-facing hold: turn back to profile before any running
  // starts, stowing the clipboard first when there is one.
  if (to === 'run') return resolveWorkerDeparture(from);
  return null;
}

/** How long a one-shot clip needs before its target pose may take over. */
export function workerClipDurationMs(atlas: WorkerSpriteAtlas) {
  if (atlas.fps <= 0) return 0;
  return Math.round((atlas.frameCount / atlas.fps) * 1000);
}

/**
 * Resolves the worker's semantic pose without changing the public guide state.
 * `runTerminal` is deliberately supplied by the integration layer: an active
 * Run tab alone does not mean a video/result exists yet.
 */
export function resolveWorkerGuidePresentation(
  guide: WorkspaceGuideState,
  travelling = false,
  runTerminal = false,
  workPending = false,
): WorkerGuidePresentation {
  if (travelling || guide.phase === 'working') return { clip: 'run', mode: 'loop' };
  if (guide.phase === 'blocked') return { clip: 'blocked', mode: 'hold' };
  // A finished Run outranks the rest: the work that mattered is done, so the
  // worker settles even when an earlier step no longer reads complete -- a
  // reloaded page holds no approval, which leaves Build merely "available".
  //
  // Any non-Run tab after that Run is a review, whichever way the worker got
  // there. Keying this on `direction` made the pose depend on a value that only
  // survives until the next render, so the clipboard often never appeared.
  if (runTerminal) {
    return guide.activeStep === 'run'
      ? { clip: 'crossed_arms', mode: 'hold' }
      : { clip: 'review_clipboard', mode: 'hold' };
  }
  // Otherwise, anything still to do anywhere in the pipeline -- nothing built
  // yet, a Build awaiting approval, a Run not dispatched -- keeps the worker
  // running on the spot rather than standing about. `WorkspaceGuideState`
  // cannot say this: its `phase` describes the active step alone and folds
  // "available" into "complete", and it is not ours to change.
  if (workPending) return { clip: 'run', mode: 'loop' };
  return { clip: guide.activeStep === 'run' ? 'success' : 'point', mode: 'hold' };
}

/** Display geometry for one cell: fitted to the lane box by height. */
export function workerSpriteDisplaySize(atlas: WorkerSpriteAtlas) {
  const height = workerSpriteBox.height;
  return { width: Math.round((atlas.frameWidth * height) / atlas.frameHeight), height };
}

/**
 * `travelling` is true while Motion is carrying the worker between tabs, which
 * is the moment the run cycle belongs on screen. A settled step holds a pose.
 */
export function resolveWorkerSpriteClip(guide: WorkspaceGuideState, travelling = false): WorkerSpriteClip {
  if (travelling) return 'run';
  if (guide.phase === 'blocked') return 'blocked';
  if (guide.phase === 'working') return 'run';
  return guide.activeStep === 'run' ? 'success' : 'point';
}

function clampIndex(value: number, maximum: number) {
  return Math.min(maximum, Math.max(0, value));
}

/** Frame index inside the clip. Loops wrap; one-shots clamp on the last frame. */
export function workerSpriteFrame(atlas: WorkerSpriteAtlas, elapsedMs: number): number {
  const last = Math.max(0, atlas.frameCount - 1);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || atlas.fps <= 0) return 0;
  const advanced = Math.floor((elapsedMs * atlas.fps) / 1000);
  if (atlas.playback === 'loop') return advanced % atlas.frameCount;
  return clampIndex(advanced, last);
}

/** Absolute atlas cell for a clip-local frame index. */
export function workerSpriteCell(atlas: WorkerSpriteAtlas, frame: number) {
  const absolute = atlas.firstFrame + clampIndex(frame, Math.max(0, atlas.frameCount - 1));
  return { column: absolute % atlas.columns, row: Math.floor(absolute / atlas.columns) };
}

export function workerSpriteBackgroundPosition(atlas: WorkerSpriteAtlas, frame: number) {
  const { column, row } = workerSpriteCell(atlas, frame);
  const display = workerSpriteDisplaySize(atlas);
  return `${-column * display.width}px ${-row * display.height}px`;
}

/**
 * `auto` height keeps the native aspect, so every row lands on an exact
 * multiple of the display height and no neighbouring cell bleeds into view.
 */
export function workerSpriteBackgroundSize(atlas: WorkerSpriteAtlas) {
  return `${atlas.columns * workerSpriteDisplaySize(atlas).width}px auto`;
}

/** Reduced motion shows one representative, non-transitional frame. */
export function workerSpriteStaticFrame(atlas: WorkerSpriteAtlas) {
  return atlas.playback === 'loop' ? 0 : Math.max(0, atlas.frameCount - 1);
}

/** The frame clock only advances while the guide is visible and animated. */
export function shouldAdvanceWorkerSprite(reducedMotion: boolean, documentHidden: boolean, inViewport: boolean) {
  return !reducedMotion && !documentHidden && inViewport;
}

/**
 * Travel timing. Distance buys speed rather than time: every cross starts from
 * the same half-second base, so a short hop stays unhurried and a wide lane
 * does not drag.
 */
export const workerTravelSpeedPxPerSecond = 1000;

/**
 * A beat between arriving and turning. Without it the worker brakes out of the
 * run the same frame it stops moving, which reads as a jump cut rather than a
 * character deciding to turn around.
 */
export const workerBridgeDelayMs = 240;

/**
 * Below this the worker slides quietly instead of running. Lane measurement
 * settles over a few frames in a real browser — fonts, the split layout — and
 * a 3px correction is not a journey.
 */
export const minimumTravelPx = 24;

export function isWorkerTravel(fromX: number, toX: number) {
  return Math.abs(toX - fromX) >= minimumTravelPx;
}

/**
 * Deliberately sublinear: a long cross covers more ground per second than a
 * short one, so a wide lane does not drag while a short hop still reads as a
 * run rather than a blink.
 */
export function workerTravelDuration(distancePx: number) {
  const seconds = 0.5 + Math.abs(distancePx) / workerTravelSpeedPxPerSecond;
  return Math.min(1.2, Math.max(0.55, Number(seconds.toFixed(3))));
}
