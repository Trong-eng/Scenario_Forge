import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStreamingText } from '@/components/forge/useStreamingText';

/**
 * Drives rAF manually so the drain is measured in deterministic frames rather
 * than wall-clock time.
 */
let frames: Array<(time: number) => void> = [];
let now = 0;

function flushFrame(advanceMs = 16) {
  now += advanceMs;
  const pending = frames;
  frames = [];
  act(() => { pending.forEach((callback) => callback(now)); });
}

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('useStreamingText', () => {
  it('reveals arrived text progressively rather than all at once', () => {
    const target = 'Agent đã dựng Definition cho tình huống người đi bộ băng qua đường.';
    const { result, rerender } = renderHook(
      (props: { target: string; running: boolean }) => useStreamingText(props),
      { initialProps: { target, running: true } },
    );

    expect(result.current.shown).toBe('');
    expect(result.current.settled).toBe(false);

    flushFrame();
    rerender({ target, running: true });
    const afterOneFrame = result.current.shown.length;

    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(target.length);
    expect(target.startsWith(result.current.shown)).toBe(true);
  });

  it('drains a trailing burst to completion instead of crawling', () => {
    const target = 'x'.repeat(200);
    const { result, rerender } = renderHook(
      (props: { target: string; running: boolean }) => useStreamingText(props),
      { initialProps: { target, running: true } },
    );

    // The advance is proportional to the backlog, so a burst with nothing
    // following it decays exponentially onto MIN_RATE. What matters is that the
    // floor and the snap actually terminate it, well under a second.
    for (let frame = 0; frame < 40 && result.current.shown.length < target.length; frame += 1) {
      flushFrame();
      rerender({ target, running: true });
    }
    expect(result.current.shown).toBe(target);
    expect(result.current.settled).toBe(true);
  });

  it('keeps pace with continuous arrival rather than throttling it', () => {
    // The spec's load-bearing property: over any window the reveal must keep up
    // with arrival. A throttle would fall progressively further behind.
    const full = 'a'.repeat(2000);
    let arrived = 0;
    const { result, rerender } = renderHook(
      (props: { target: string; running: boolean }) => useStreamingText(props),
      { initialProps: { target: '', running: true } },
    );

    // ~300 chars/s arriving: 5 chars per 16 ms frame, for 60 frames (~1 s).
    for (let frame = 0; frame < 60; frame += 1) {
      arrived += 5;
      rerender({ target: full.slice(0, arrived), running: true });
      flushFrame();
      rerender({ target: full.slice(0, arrived), running: true });
    }

    const lag = arrived - result.current.shown.length;
    // Steady-state lag is CATCH_UP_SECONDS x arrival rate ~= 0.18 * 300 ~= 54.
    expect(lag).toBeLessThan(120);
    expect(result.current.shown.length).toBeGreaterThan(arrived * 0.9);
  });

  it('jumps without animating when a whole blob arrives at once (bounded-replay decision)', () => {
    // Above JUMP_THRESHOLD_CHARS: this text did not stream in, it landed —
    // pacing it would be simulating progress that already happened.
    const target = 'y'.repeat(900);
    const { result } = renderHook(() => useStreamingText({ target, running: true }));

    expect(result.current.shown).toBe(target);
    expect(frames).toHaveLength(0);
  });

  it('flushes the remainder immediately when the turn stops running', () => {
    const target = 'Đã dựng xong Definition và sẵn sàng build.';
    const { result, rerender } = renderHook(
      (props: { target: string; running: boolean }) => useStreamingText(props),
      { initialProps: { target, running: true } },
    );
    flushFrame();
    rerender({ target, running: true });
    expect(result.current.shown.length).toBeLessThan(target.length);

    rerender({ target, running: false });
    expect(result.current.shown).toBe(target);
    expect(result.current.settled).toBe(true);
  });

  it('paints in a single step under prefers-reduced-motion', () => {
    const target = 'Agent đã hoàn tất lượt xử lý này.';
    const { result } = renderHook(() => useStreamingText({ target, running: true, reducedMotion: true }));

    expect(result.current.shown).toBe(target);
    expect(frames).toHaveLength(0);
  });

  it('swaps rather than appends when the durable text replaces the draft', () => {
    const draft = 'Agent đang dựng Definition';
    const durable = 'Hoàn toàn khác: agent đã dừng an toàn.';
    const { result, rerender } = renderHook(
      (props: { target: string; running: boolean }) => useStreamingText(props),
      { initialProps: { target: draft, running: true } },
    );
    flushFrame();
    rerender({ target: draft, running: true });

    rerender({ target: durable, running: false });
    expect(result.current.shown).toBe(durable);
    expect(result.current.shown).not.toContain(draft);
  });

  it('never reveals text that has not arrived', () => {
    const { result, rerender } = renderHook(
      (props: { target: string; running: boolean }) => useStreamingText(props),
      { initialProps: { target: 'Đang xử lý', running: true } },
    );
    for (let frame = 0; frame < 5; frame += 1) {
      flushFrame();
      rerender({ target: 'Đang xử lý', running: true });
    }
    expect(result.current.shown).toBe('Đang xử lý');
  });
});
