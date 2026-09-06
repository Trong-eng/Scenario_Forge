import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const NEAR_BOTTOM_PX = 96;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useConversationAutoFollow<T extends HTMLElement>(dependency: unknown): {
  viewportRef: RefObject<T>;
  detached: boolean;
  onScroll: () => void;
  jumpToLatest: () => void;
  followNow: () => void;
} {
  const viewportRef = useRef<T>(null);
  const followingRef = useRef(true);
  const mountedRef = useRef(false);
  const [detached, setDetached] = useState(false);

  const scrollToLatest = useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    if (!viewport || typeof viewport.scrollTo !== 'function') return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  const onScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const gap = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    const following = gap <= NEAR_BOTTOM_PX;
    followingRef.current = following;
    setDetached(!following);
  }, []);

  /**
   * Pin to the bottom during a reveal.
   *
   * The layout effect below is keyed on a conversation version that only moves
   * at durable event boundaries, and ephemeral token frames never advance the
   * cursor — so without this the view stops following the moment an answer
   * starts growing, which is the opposite of what a reader expects.
   *
   * Deliberately an imperative method rather than a second dependency: adding a
   * high-frequency dep to the effect would re-issue a smooth `scrollTo` every
   * frame, and a smooth scroll restarted each frame fights its own in-flight
   * animation and rubber-bands. Assigning `scrollTop` is instant, and during a
   * reveal the content grows a few pixels a frame, so instant *is* smooth.
   *
   * Guarded by `followingRef`, never by `detached` state, so it cannot render.
   */
  const followNow = useCallback(() => {
    if (!followingRef.current) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  const jumpToLatest = useCallback(() => {
    followingRef.current = true;
    setDetached(false);
    scrollToLatest(prefersReducedMotion() ? 'auto' : 'smooth');
  }, [scrollToLatest]);

  useLayoutEffect(() => {
    const firstLayout = !mountedRef.current;
    mountedRef.current = true;
    if (!firstLayout && !followingRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      scrollToLatest(firstLayout || prefersReducedMotion() ? 'auto' : 'smooth');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dependency, scrollToLatest]);

  return { viewportRef, detached, onScroll, jumpToLatest, followNow };
}
