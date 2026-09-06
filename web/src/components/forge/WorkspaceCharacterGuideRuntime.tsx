'use client';

import { useEffect, useRef, useState } from 'react';
import {
  shouldAdvanceWorkerSprite,
  workerSpriteBackgroundPosition,
  workerSpriteBackgroundSize,
  workerSpriteDisplaySize,
  workerSpriteFrame,
  workerSpriteStaticFrame,
  type WorkerSpriteAtlas,
  type WorkerSpriteClip,
} from './workspaceWorkerSprite';

type Props = {
  clip: WorkerSpriteClip;
  atlas: WorkerSpriteAtlas;
  reducedMotion: boolean;
  /** -1 mirrors the whole atlas so the worker faces the way it travels. */
  facing?: 1 | -1;
  onAssetError: () => void;
};

/**
 * One DOM sprite surface. The frame clock lives in refs and writes only
 * `background-position`, so React never re-renders while the worker animates.
 *
 * The sheet is the 320x448 master and the browser scales it. Per-ratio sheets
 * and a canvas that blitted them at exact device pixels were both tried: they
 * bought a little sharpness at 100% and lost it again the moment the page was
 * zoomed, because a sheet cut to the painted size has nothing left to enlarge.
 */
export default function WorkspaceCharacterGuideRuntime({ clip, atlas, reducedMotion, facing = 1, onAssetError }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  /** Clip time already played, kept across pauses so playback resumes in place. */
  const elapsedRef = useRef(0);
  const originRef = useRef<number | null>(null);
  const paintedFrameRef = useRef(-1);
  const rafRef = useRef(0);
  const [inViewport, setInViewport] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(false);

  const animate = shouldAdvanceWorkerSprite(reducedMotion, documentHidden, inViewport);
  const display = workerSpriteDisplaySize(atlas);

  // A new clip owns a new clock; a pause deliberately keeps the old one.
  useEffect(() => {
    elapsedRef.current = 0;
    originRef.current = null;
    paintedFrameRef.current = -1;
  }, [atlas.firstFrame, atlas.frameCount, atlas.src]);

  useEffect(() => {
    const paint = (frame: number) => {
      const surface = surfaceRef.current;
      if (!surface || frame === paintedFrameRef.current) return;
      paintedFrameRef.current = frame;
      surface.style.backgroundPosition = workerSpriteBackgroundPosition(atlas, frame);
      surface.dataset.spriteFrame = String(frame);
    };

    if (!animate || typeof requestAnimationFrame === 'undefined') {
      paint(reducedMotion ? workerSpriteStaticFrame(atlas) : workerSpriteFrame(atlas, elapsedRef.current));
      return;
    }

    const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
    // A test double that invokes its callback synchronously would otherwise
    // drive this loop straight into a stack overflow; re-entry just stops.
    let ticking = false;
    const tick = (timestamp: number) => {
      if (ticking) return;
      ticking = true;
      try {
        if (originRef.current === null) originRef.current = timestamp;
        paint(workerSpriteFrame(atlas, elapsedRef.current + (timestamp - originRef.current)));
        rafRef.current = requestAnimationFrame(tick);
      } finally {
        ticking = false;
      }
    };

    paint(workerSpriteFrame(atlas, elapsedRef.current));
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (originRef.current !== null) {
        elapsedRef.current += now() - originRef.current;
        originRef.current = null;
      }
    };
  }, [animate, atlas, reducedMotion]);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry?.isIntersecting ?? false), { threshold: 0.01 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setDocumentHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // A missing or broken atlas hands the parent its static fallback instead.
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    let cancelled = false;
    const probe = new Image();
    probe.onerror = () => { if (!cancelled) onAssetError(); };
    probe.src = atlas.src;
    return () => { cancelled = true; };
  }, [atlas.src, onAssetError]);

  return <div
    ref={surfaceRef}
    data-testid="workspace-worker-sprite"
    data-sprite-clip={clip}
    data-sprite-animating={animate ? 'true' : 'false'}
    data-sprite-facing={facing}
    aria-hidden="true"
    className="mx-auto"
    style={{
      backgroundImage: `url(${atlas.src})`,
      backgroundSize: workerSpriteBackgroundSize(atlas),
      backgroundRepeat: 'no-repeat',
      backgroundPosition: workerSpriteBackgroundPosition(atlas, reducedMotion ? workerSpriteStaticFrame(atlas) : 0),
      width: display.width,
      height: display.height,
      transform: facing === -1 ? 'scaleX(-1)' : undefined,
    }}
  />;
}
