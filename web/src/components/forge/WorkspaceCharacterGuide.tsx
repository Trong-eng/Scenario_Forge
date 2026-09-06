'use client';

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import type { CanvasStep, WorkspaceGuideState } from './workspaceCanvasModel';
import {
  deriveWorkerGuideInputs,
  resolveWorkerGuidePosition,
  type GuideRunProgress,
  type GuideStepBounds,
} from './workspaceWorkerGuide';
import { workspaceWorkerGuideAsset } from './workspaceWorkerGuideAsset';
import {
  isWorkerDepartureClip,
  isWorkerTransitionClip,
  isWorkerTravel,
  resolveWorkerDeparture,
  resolveWorkerUnwind,
  sliceWorkerClip,
  workerSpriteFrame,
  resolveWorkerGuidePresentation,
  resolveWorkerTransition,
  workerBridgeDelayMs,
  workerClipDurationMs,
  workerSpriteAtlases,
  workerSpriteBox,
  workerTravelDuration,
  type WorkerSpriteAtlas,
  type WorkerSpriteClip,
} from './workspaceWorkerSprite';

const WorkerGuideRuntime = lazy(() => import('./WorkspaceCharacterGuideRuntime'));
const spriteAtlases = workerSpriteAtlases(workspaceWorkerGuideAsset);

type Travel = { active: boolean; facing: 1 | -1; duration: number };

const timestamp = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/** Only used before the first render settles on a real presentation clip. */
const workerSpriteClipFallback: WorkerSpriteClip = 'point';

type Props = {
  guide: WorkspaceGuideState;
  runProgress?: GuideRunProgress;
  runTerminal?: boolean;
  /** Some step in the pipeline is unfinished, so there is still work to do. */
  workPending?: boolean;
  laneRef: RefObject<HTMLDivElement>;
  anchorRefs: MutableRefObject<Partial<Record<CanvasStep, HTMLButtonElement | null>>>;
  enabled?: boolean;
};

const fallbackBounds: GuideStepBounds = {
  structured: { left: 0, right: 1 },
  build: { left: 1, right: 2 },
  run: { left: 2, right: 3 },
};

function measuredBounds(lane: HTMLDivElement, anchors: Props['anchorRefs']['current']): GuideStepBounds | null {
  const laneRect = lane.getBoundingClientRect();
  if (laneRect.width <= 0) return null;
  const bounds = {} as GuideStepBounds;
  for (const step of ['structured', 'build', 'run'] as const) {
    const rect = anchors[step]?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    bounds[step] = {
      left: rect.left - laneRect.left,
      right: rect.right - laneRect.left,
    };
  }
  return bounds;
}

/** Motion owns spatial travel. The sprite atlas only owns the worker's body. */
export function WorkspaceCharacterGuide({ guide, runProgress, runTerminal = false, workPending = false, laneRef, anchorRefs, enabled = workspaceWorkerGuideAsset.enabled }: Props) {
  const reducedMotion = useReducedMotion() ?? false;
  const [bounds, setBounds] = useState<GuideStepBounds>(fallbackBounds);
  const [laneWidth, setLaneWidth] = useState(0);
  const [assetFailed, setAssetFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [measureAttempt, setMeasureAttempt] = useState(0);
  const [boundsReady, setBoundsReady] = useState(false);
  // The Canvas lays the lane out on a fractional boundary, so the worker landed
  // on half a pixel and the compositor resampled the sprite every frame -- the
  // last of the blur. This is the correction that puts it back on whole pixels.
  const [laneSubpixel, setLaneSubpixel] = useState(0);

  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (!lane) {
      // The guide is rendered *inside* the lane, and React attaches a parent's
      // ref after its children's layout effects run, so the first attempt sees
      // no lane at all. Retry inside the same commit: a state change here is
      // flushed before paint, so the worker never appears at the wrong x.
      if (measureAttempt < 3) setMeasureAttempt(measureAttempt + 1);
      return;
    }
    const update = () => {
      setLaneWidth(lane.getBoundingClientRect().width);
      setLaneSubpixel(Math.round(lane.getBoundingClientRect().left) - lane.getBoundingClientRect().left);
      const next = measuredBounds(lane, anchorRefs.current);
      if (next) {
        setBounds(next);
        setBoundsReady(true);
      }
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(lane);
    Object.values(anchorRefs.current).forEach((anchor) => anchor && observer?.observe(anchor));
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [anchorRefs, laneRef, measureAttempt]);

  const inputs = useMemo(
    () => deriveWorkerGuideInputs(guide, runProgress, reducedMotion),
    [guide, reducedMotion, runProgress],
  );
  const handleAssetError = useCallback(() => setAssetFailed(true), []);
  // Snapped to whole device pixels: a sprite painted at a fractional offset is
  // resampled by the compositor, which softens every edge of the artwork.
  const targetX = laneWidth > 0
    ? Math.round(resolveWorkerGuidePosition(guide, bounds, laneWidth, workerSpriteBox.width, inputs.progress)) + laneSubpixel
    : 0;

  // The worker runs only while it is actually crossing the lane: switching to a
  // reachable tab starts a travel, and arriving ends it. Guide state alone
  // cannot express this, because `direction` keeps its value after the move.
  const previousXRef = useRef<number | null>(null);
  // The travel effect reads the current clip without re-running when it changes.
  const clipRef = useRef<WorkerSpriteClip>(workerSpriteClipFallback);
  const clipAtlasRef = useRef<WorkerSpriteAtlas | null>(null);
  const bridgeStartedAtRef = useRef(0);
  // When the departure turn currently playing ends. A second click during that
  // turn waits out the remainder instead of moving at once, which is what made
  // the worker slide sideways mid-turn.
  const departureEndsAtRef = useRef(0);
  const [travel, setTravel] = useState<Travel>({ active: false, facing: 1, duration: 0.55 });
  // What Motion is actually animating towards. It lags `targetX` while the
  // worker turns to face the way it is about to go.
  const [animateX, setAnimateX] = useState(0);

  useEffect(() => {
    // Wait for real tab bounds: the placeholder bounds used before the first
    // measurement would otherwise make the worker "run" on page load.
    if (laneWidth <= 0 || !boundsReady) return;
    const previous = previousXRef.current;
    previousXRef.current = targetX;
    if (previous === null || !isWorkerTravel(previous, targetX)) {
      // First placement, or a measurement nudge too small to be a journey:
      // move without any running.
      setAnimateX(targetX);
      return;
    }
    const duration = workerTravelDuration(targetX - previous);
    setTravel({ active: true, facing: targetX > previous ? 1 : -1, duration });

    // A front-facing worker turns back to profile before it moves, so the whole
    // chain reads: standing -> turn -> run -> turn -> standing. A worker already
    // in profile leaves at once.
    const current = clipRef.current;
    let lead = 0;
    if (isWorkerDepartureClip(current)) {
      // Already turning to leave: wait out what is left of that turn.
      lead = Math.max(0, departureEndsAtRef.current - timestamp());
    } else if (isWorkerTransitionClip(current)) {
      // Still turning to face the viewer. Unwind that turn from the angle it
      // reached instead of sliding away mid-rotation.
      const playing = clipAtlasRef.current ?? spriteAtlases[current];
      const unwind = resolveWorkerUnwind(current, workerSpriteFrame(playing, timestamp() - bridgeStartedAtRef.current));
      if (unwind) {
        lead = workerClipDurationMs(sliceWorkerClip(spriteAtlases[unwind.clip], unwind.skip));
        setClip(unwind.clip, unwind.skip);
      }
    } else {
      const departure = resolveWorkerDeparture(current);
      if (departure) lead = workerClipDurationMs(spriteAtlases[departure]);
    }
    departureEndsAtRef.current = timestamp() + lead;
    const leaving = setTimeout(() => setAnimateX(targetX), lead);
    // Motion's completion callback is the normal way out; this timer is the
    // guarantee, so an interrupted animation can never leave the worker
    // running on the spot forever.
    const settled = setTimeout(
      () => setTravel((current) => ({ ...current, active: false })),
      lead + duration * 1000 + 80,
    );
    return () => { clearTimeout(leaving); clearTimeout(settled); };
  }, [boundsReady, laneWidth, targetX]);

  const settle = useCallback(() => setTravel((current) => (current.active ? { ...current, active: false } : current)), []);
  const travelling = travel.active && !reducedMotion;
  const presentation = resolveWorkerGuidePresentation(guide, travelling, runTerminal, workPending);
  const target = presentation.clip;

  // The worker does not cut between the profile run and a front-facing hold:
  // it brakes, turns, and folds its arms or raises the clipboard first. Reduced
  // motion skips straight to the destination pose.
  // `skip` lets a clip be entered part-way through, which is how an arrival
  // turn is unwound from the angle it had reached.
  const [clipState, setClipState] = useState<{ clip: WorkerSpriteClip; skip: number }>({ clip: target, skip: 0 });
  const clip = clipState.clip;
  const clipAtlas = sliceWorkerClip(spriteAtlases[clip], clipState.skip);
  clipRef.current = clip;
  clipAtlasRef.current = clipAtlas;
  const setClip = useCallback((next: WorkerSpriteClip, skip = 0) => {
    bridgeStartedAtRef.current = timestamp();
    setClipState({ clip: next, skip });
  }, []);

  useEffect(() => {
    if (clip === target) return;
    if (reducedMotion) {
      setClip(target);
      return;
    }
    if (isWorkerTransitionClip(clip)) {
      // A bridge is playing: let it finish, then take the target pose.
      const finished = setTimeout(() => setClip(target), workerClipDurationMs(clipAtlas));
      return () => clearTimeout(finished);
    }
    const bridge = resolveWorkerTransition(clip, target);
    if (!bridge) {
      setClip(target);
      return;
    }
    if (target === 'run') {
      // Departing: the turn starts on the click, and the travel effect waits
      // for exactly this clip's length before moving the worker.
      departureEndsAtRef.current = timestamp() + workerClipDurationMs(spriteAtlases[bridge]);
      setClip(bridge);
      return;
    }
    // Arriving: hold the current clip for a beat first, so stopping and
    // turning read as two moments instead of one cut.
    const starting = setTimeout(() => setClip(bridge), workerBridgeDelayMs);
    return () => clearTimeout(starting);
  }, [clip, reducedMotion, target]);
  // Work in progress with nowhere to move: the gait plays and the body stays
  // put. It used to also slide +/-8px, which is the twitch that reads as a
  // stutter rather than as running -- the gait already carries the meaning, and
  // inventing horizontal motion for progress nobody can measure was never
  // truthful anyway.
  const runningInPlace = clip === 'run' && !travel.active && !reducedMotion;

  return <motion.div
    data-testid="workspace-worker-guide"
    data-guide-progress={inputs.progress}
    data-guide-clip={clip}
    data-guide-target-clip={target}
    data-guide-presentation={presentation.mode}
    data-guide-travelling={travelling ? 'true' : 'false'}
    data-guide-x={Math.round(animateX)}
    data-guide-running-in-place={runningInPlace ? 'true' : 'false'}
    aria-hidden="true"
    className="pointer-events-none absolute bottom-0 z-10 h-[126px] w-[117px] overflow-hidden"
    hidden={!enabled}
    initial={false}
    animate={{ x: animateX }}
    transition={travelling
      // Constant speed while running: easing would make the feet skate at the
      // ends of the cross, where the body slows but the cycle does not.
      ? { duration: travel.duration, ease: 'linear' }
      : { duration: reducedMotion ? 0.01 : 0.28, ease: [0.16, 1, 0.3, 1] }}
    onAnimationComplete={settle}
  >
    {enabled && !assetFailed ? <Suspense fallback={null}>
      <WorkerGuideRuntime
        clip={clip}
        atlas={clipAtlas}
        reducedMotion={reducedMotion}
        facing={travel.facing}
        onAssetError={handleAssetError}
      />
    </Suspense> : null}
    {enabled && assetFailed && !fallbackFailed ? <Image
      src={workspaceWorkerGuideAsset.fallbackSrc}
      alt=""
      aria-hidden="true"
      width={workerSpriteBox.width}
      height={workerSpriteBox.height}
      className="h-full w-full object-contain object-bottom"
      onError={() => setFallbackFailed(true)}
    /> : null}
  </motion.div>;
}
