'use client';

import { useEffect, useState } from 'react';

/**
 * Paces text that has *genuinely arrived* (CHATGPT-INTERACTION-SPEC §5.2).
 *
 * This is a smoother, not a throttle. Tokens reach the browser in bursts —
 * network chunking plus the rAF batching in `useAgentThread` — so painting each
 * burst directly lands as a visible jump. The drain spreads a burst over a few
 * frames while guaranteeing it never falls far behind arrival.
 *
 * Streaming must never simulate progress, which sets two hard rules this
 * implementation exists to honour:
 *
 *  - the reveal is bounded below by the arrival rate (see `CATCH_UP_SECONDS`),
 *    so it can smooth a burst but can never pretend text is still coming; and
 *  - a blob that arrives whole — a reconnect replaying the durable full-text
 *    event — is never paced at all. It jumps. Animating it would be inventing a
 *    generation that already finished.
 */

/**
 * Time constant of the approach, not a deadline. The advance is proportional to
 * the backlog, so under *continuous* arrival at A chars/s the backlog settles at
 * 0.18 × A — i.e. a steady-state lag of 0.18 s, independent of how fast the
 * provider is. A trailing burst decays exponentially toward the floor below.
 */
const CATCH_UP_SECONDS = 0.18;
/**
 * Floor, so a slow trickle does not read as a stall and so the exponential
 * tail of a burst resolves instead of crawling. Raising it is always safe:
 * `shown` is clamped to `target`, so a faster floor can never reveal text that
 * has not arrived — it only consumes text that already has.
 */
const MIN_RATE_CHARS_PER_SECOND = 240;
/** Ceiling, so a large burst still resolves over a few frames rather than snapping. */
const MAX_RATE_CHARS_PER_SECOND = 1200;
/** Above this backlog the text did not stream — it landed. Jump. */
const JUMP_THRESHOLD_CHARS = 600;
/** Extend an advance to a word end within this reach, so words never appear half-drawn. */
const WORD_BOUNDARY_LOOKAHEAD = 12;
/** A handful of trailing characters finish at once rather than over more frames. */
const SNAP_REMAINDER_CHARS = 8;
/** A long frame gap (backgrounded tab) must not translate into one huge advance. */
const MAX_FRAME_SECONDS = 0.1;

export type StreamingTextOptions = {
  /** Everything received so far. */
  target: string;
  /** Whether the turn is still running. On false the remainder flushes at once. */
  running: boolean;
  reducedMotion?: boolean;
};

export type StreamingText = {
  /** The portion to paint. */
  shown: string;
  /** True once `shown` has caught up with `target`. */
  settled: boolean;
};

function wordBoundedEnd(text: string, index: number) {
  const limit = Math.min(index + WORD_BOUNDARY_LOOKAHEAD, text.length);
  for (let cursor = index; cursor < limit; cursor += 1) {
    if (/\s/.test(text[cursor] ?? '')) return cursor;
  }
  return index;
}

export function useStreamingText({ target, running, reducedMotion = false }: StreamingTextOptions): StreamingText {
  const [shown, setShown] = useState('');

  useEffect(() => {
    // Not a continuation. Either a new turn reset the text, or the durable
    // event replaced the draft with a differing string. Either way, re-animating
    // from a prefix that no longer holds would garble the output — swap it.
    if (!target.startsWith(shown)) {
      setShown(target);
      return;
    }

    const backlog = target.length - shown.length;
    if (backlog === 0) return;

    if (reducedMotion || !running || backlog > JUMP_THRESHOLD_CHARS || backlog <= SNAP_REMAINDER_CHARS) {
      setShown(target);
      return;
    }

    let previousTime: number | null = null;
    const frame = window.requestAnimationFrame(function step(time) {
      const elapsed = previousTime == null
        ? 1 / 60
        : Math.min((time - previousTime) / 1000, MAX_FRAME_SECONDS);
      previousTime = time;
      const rate = Math.min(
        Math.max(backlog / CATCH_UP_SECONDS, MIN_RATE_CHARS_PER_SECOND),
        MAX_RATE_CHARS_PER_SECOND,
      );
      const advanced = shown.length + Math.max(1, Math.ceil(rate * elapsed));
      const next = advanced >= target.length ? target.length : wordBoundedEnd(target, advanced);
      setShown(target.slice(0, next));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [target, shown, running, reducedMotion]);

  return { shown, settled: shown.length === target.length };
}
