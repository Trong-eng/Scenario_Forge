import { createRef, Profiler, useRef, type MutableRefObject, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceCharacterGuide } from '../../../src/components/forge/WorkspaceCharacterGuide';
import WorkspaceCharacterGuideRuntime from '../../../src/components/forge/WorkspaceCharacterGuideRuntime';
import { workerSpriteAtlases } from '../../../src/components/forge/workspaceWorkerSprite';
import type { CanvasStep, WorkspaceGuideState } from '../../../src/components/forge/workspaceCanvasModel';

type AnchorRefs = MutableRefObject<Partial<Record<CanvasStep, HTMLButtonElement | null>>>;

let frameCallbacks: FrameRequestCallback[] = [];
let clock = 0;
let resizeCallbacks: ResizeObserverCallback[] = [];
const drawImage = vi.fn();
const setTransform = vi.fn();
const canvasContext = {
  clearRect: vi.fn(),
  drawImage,
  setTransform,
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'low',
} as unknown as CanvasRenderingContext2D;

class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private value = '';

  set src(value: string) {
    this.value = value;
    const scale = value.includes('@3x') ? 3 : value.includes('@2x') ? 2 : 1;
    this.naturalWidth = 546 * scale;
    this.naturalHeight = 512 * scale;
    queueMicrotask(() => this.onload?.());
  }

  get src() { return this.value; }
}

class ControlledResizeObserver {
  constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function reportDevicePixels(inlineSize: number, blockSize: number) {
  const callback = resizeCallbacks.at(-1);
  if (!callback) throw new Error('ResizeObserver was not mounted');
  act(() => callback([{
    devicePixelContentBoxSize: [{ inlineSize, blockSize }],
  } as unknown as ResizeObserverEntry], {} as ResizeObserver));
}

/**
 * Advance the fake timers and the mocked `performance.now` together. Code that
 * measures how much of a clip is left reads the clock, so letting the two drift
 * apart would test a timeline the browser never sees.
 */
function advance(ms: number, slices = 8) {
  const slice = Math.ceil(ms / slices);
  for (let index = 0; index < slices; index += 1) {
    clock += slice;
    act(() => { vi.advanceTimersByTime(slice); });
  }
}

function tick(ms: number) {
  clock += ms;
  const pending = frameCallbacks;
  frameCallbacks = [];
  act(() => { pending.forEach((callback) => callback(clock)); });
}

function Harness({ guide, runTerminal = false, onRender, children }: { guide: WorkspaceGuideState; runTerminal?: boolean; onRender?: () => void; children?: ReactNode }) {
  const laneRef = useRef<HTMLDivElement>(null);
  const anchorRefs = useRef<Partial<Record<CanvasStep, HTMLButtonElement | null>>>({}) as AnchorRefs;
  return <Profiler id="guide" onRender={() => onRender?.()}>
    <div ref={laneRef} data-testid="lane">
      <WorkspaceCharacterGuide enabled guide={guide} runTerminal={runTerminal} laneRef={laneRef} anchorRefs={anchorRefs} />
      {children}
    </div>
  </Profiler>;
}

const workingBuild: WorkspaceGuideState = { activeStep: 'build', phase: 'working', direction: 'forward' };

async function renderGuide(guide: WorkspaceGuideState, onRender?: () => void) {
  render(<Harness guide={guide} onRender={onRender} />);
  return screen.findByTestId('workspace-worker-sprite');
}

beforeEach(() => {
  frameCallbacks = [];
  resizeCallbacks = [];
  clock = 0;
  drawImage.mockReset();
  setTransform.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frameCallbacks.push(callback));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WorkspaceCharacterGuide sprite runtime', () => {
  it('holds the terminal Run presentation and review presentation after stepping back', async () => {
    const terminal = render(<Harness runTerminal guide={{ activeStep: 'run', phase: 'complete', direction: 'still' }} />);
    const sprite = await screen.findByTestId('workspace-worker-sprite');
    expect(sprite.dataset.spriteClip).toBe('crossed_arms');
    expect(screen.getByTestId('workspace-worker-guide').dataset.guidePresentation).toBe('hold');
    terminal.rerender(<Harness runTerminal guide={{ activeStep: 'structured', phase: 'complete', direction: 'backward' }} />);
    // Stepping back no longer cuts to the review pose: the worker holds its
    // current pose for a beat, then turns and raises the clipboard. The hold
    // itself is covered with fake timers in the suite below.
    await waitFor(() => {
      expect(screen.getByTestId('workspace-worker-guide').dataset.guideClip).toBe('to_review');
    });
  });

  it('animates the run cycle without re-rendering React', async () => {
    const onRender = vi.fn();
    const sprite = await renderGuide(workingBuild, onRender);
    const rendersAfterMount = onRender.mock.calls.length;

    expect(sprite.dataset.spriteClip).toBe('run');
    expect(sprite.style.width).toBe('90px');
    expect(sprite.style.height).toBe('126px');
    expect(sprite.style.backgroundPosition).toBe('0px 0px');

    tick(0);
    tick(250); // 3 frames at 12fps
    expect(sprite.dataset.spriteFrame).toBe('3');
    expect(sprite.style.backgroundPosition).toBe('-270px 0px');

    tick(334); // frame 7 lives on the second atlas row
    expect(sprite.dataset.spriteFrame).toBe('7');
    expect(sprite.style.backgroundPosition).toBe('-90px -126px');

    tick(500); // past the one-second cycle: the loop wraps instead of running out
    expect(Number(sprite.dataset.spriteFrame)).toBeLessThan(12);
    expect(onRender.mock.calls.length).toBe(rendersAfterMount);
    expect(screen.getByTestId('workspace-worker-sprite')).toBe(sprite);
  });

  it('pauses on a hidden document and resumes from the same frame', async () => {
    const sprite = await renderGuide(workingBuild);
    tick(0);
    tick(250);
    expect(sprite.dataset.spriteFrame).toBe('3');

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sprite.dataset.spriteAnimating).toBe('false');

    tick(5_000); // time passes while hidden; the clip must not jump ahead
    expect(sprite.dataset.spriteFrame).toBe('3');

    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sprite.dataset.spriteAnimating).toBe('true');
    tick(0);
    expect(sprite.dataset.spriteFrame).toBe('3');
    tick(84);
    expect(sprite.dataset.spriteFrame).toBe('4');
  });

  it('pauses while the guide lane is outside the viewport', async () => {
    const observers: IntersectionObserverCallback[] = [];
    class OffscreenObserver {
      constructor(callback: IntersectionObserverCallback) { observers.push(callback); }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal('IntersectionObserver', OffscreenObserver);

    const sprite = await renderGuide(workingBuild);
    expect(sprite.dataset.spriteAnimating).toBe('true');
    act(() => { observers[0]?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver); });
    expect(sprite.dataset.spriteAnimating).toBe('false');
  });

  it('pauses on a hidden document and resumes from the same frame', async () => {
    const sprite = await renderGuide(workingBuild);
    tick(0);
    tick(250);
    expect(sprite.dataset.spriteFrame).toBe('3');

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sprite.dataset.spriteAnimating).toBe('false');

    tick(5_000); // time passes while hidden; the clip must not jump ahead
    expect(sprite.dataset.spriteFrame).toBe('3');

    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sprite.dataset.spriteAnimating).toBe('true');
    tick(0);
    expect(sprite.dataset.spriteFrame).toBe('3');
    tick(84);
    expect(sprite.dataset.spriteFrame).toBe('4');
  });

  it('pauses while the guide lane is outside the viewport', async () => {
    const observers: IntersectionObserverCallback[] = [];
    class OffscreenObserver {
      constructor(callback: IntersectionObserverCallback) { observers.push(callback); }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal('IntersectionObserver', OffscreenObserver);

    const sprite = await renderGuide(workingBuild);
    expect(sprite.dataset.spriteAnimating).toBe('true');
    act(() => { observers[0]?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver); });
    expect(sprite.dataset.spriteAnimating).toBe('false');
  });

  it('falls back to the static image when the atlas cannot load', async () => {
    class FailingImage {
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', FailingImage);

    render(<Harness guide={workingBuild} />);
    await screen.findByTestId('workspace-worker-sprite');
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('workspace-worker-sprite')).toBeNull();
    const image = document.querySelector('img');
    expect(image?.getAttribute('src')).toContain('worker-fallback-v2');
  });
});

describe('WorkspaceCharacterGuide layout contract', () => {
  it('stays decorative, out of the accessibility tree and clear of pointer input', async () => {
    render(<Harness guide={workingBuild} />);
    await screen.findByTestId('workspace-worker-sprite');
    const box = screen.getByTestId('workspace-worker-guide');
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect(box.className).toContain('pointer-events-none');
    expect(box.className).toContain('h-[126px]');
    expect(box.className).toContain('w-[117px]');
  });

  it('does not mount a sprite surface while the asset flag is off', () => {
    const laneRef = createRef<HTMLDivElement>();
    const anchorRefs = { current: {} } as AnchorRefs;
    render(<div ref={laneRef}>
      <WorkspaceCharacterGuide enabled={false} guide={workingBuild} laneRef={laneRef} anchorRefs={anchorRefs} />
    </div>);
    expect(screen.queryByTestId('workspace-worker-sprite')).toBeNull();
    expect(screen.getByTestId('workspace-worker-guide').hidden).toBe(true);
  });
});

it('keeps a single guide instance across step changes and resizes', async () => {
  const { rerender } = render(<Harness guide={workingBuild} />);
  const sprite = await screen.findByTestId('workspace-worker-sprite');
  rerender(<Harness guide={{ activeStep: 'run', phase: 'working', direction: 'forward' }} />);
  act(() => { fireEvent(window, new Event('resize')); });
  expect(screen.getAllByTestId('workspace-worker-sprite')).toHaveLength(1);
  expect(screen.getByTestId('workspace-worker-sprite')).toBe(sprite);
});

describe('running between Canvas tabs', () => {
  const steps = ['structured', 'build', 'run'] as const;
  const rects: Record<string, Partial<DOMRect>> = {
    lane: { left: 0, right: 600, width: 600 },
    structured: { left: 0, right: 200, width: 200 },
    build: { left: 200, right: 400, width: 200 },
    run: { left: 400, right: 600, width: 200 },
  };

  function TravelHarness({ guide }: { guide: WorkspaceGuideState }) {
    const laneRef = useRef<HTMLDivElement>(null);
    const anchorRefs = useRef<Partial<Record<CanvasStep, HTMLButtonElement | null>>>({}) as AnchorRefs;
    return <div ref={laneRef} data-rect="lane">
      <WorkspaceCharacterGuide enabled guide={guide} laneRef={laneRef} anchorRefs={anchorRefs} />
      {steps.map((step) => <button key={step} data-rect={step} ref={(element) => { anchorRefs.current[step] = element; }} />)}
    </div>;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rect = rects[this.dataset.rect ?? ''] ?? { left: 0, right: 0, width: 0 };
      return { top: 0, bottom: 112, height: 112, x: rect.left ?? 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect;
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  const settled = (step: CanvasStep): WorkspaceGuideState => ({ activeStep: step, phase: 'complete', direction: 'still' });

  /** findBy* polls on timers, which are faked here, so flush the lazy chunk by hand. */
  async function mount(guide: WorkspaceGuideState) {
    const view = render(<TravelHarness guide={guide} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return view;
  }

  it('holds a pose on arrival, and runs only while crossing to the next tab', async () => {
    const { rerender } = await mount(settled('structured'));
    const sprite = screen.getByTestId('workspace-worker-sprite');
    const box = screen.getByTestId('workspace-worker-guide');

    // Sitting at a tab it has not left: no travel, no run cycle.
    expect(box.dataset.guideTravelling).toBe('false');
    expect(sprite.dataset.spriteClip).toBe('point');

    rerender(<TravelHarness guide={settled('build')} />);
    expect(box.dataset.guideTravelling).toBe('true');
    expect(screen.getByTestId('workspace-worker-sprite').dataset.spriteClip).toBe('run');

    // 200px at 220px/s is 0.909s; the worker settles once it arrives.
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByTestId('workspace-worker-guide').dataset.guideTravelling).toBe('true');
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByTestId('workspace-worker-guide').dataset.guideTravelling).toBe('false');
    expect(screen.getByTestId('workspace-worker-sprite').dataset.spriteClip).toBe('point');
  });

  it('turns around to face the way it travels', async () => {
    const { rerender } = await mount(settled('run'));

    rerender(<TravelHarness guide={settled('structured')} />);
    const backwards = screen.getByTestId('workspace-worker-sprite');
    expect(backwards.dataset.spriteFacing).toBe('-1');

    act(() => { vi.advanceTimersByTime(2_000); });
    rerender(<TravelHarness guide={settled('run')} />);
    const forwards = screen.getByTestId('workspace-worker-sprite');
    expect(forwards.dataset.spriteFacing).toBe('1');
  });

  it('keeps a completed Run celebrating and a blocked step blocked once it has arrived', async () => {
    const { rerender } = await mount(settled('structured'));

    rerender(<TravelHarness guide={settled('run')} />);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByTestId('workspace-worker-sprite').dataset.spriteClip).toBe('success');

    rerender(<TravelHarness guide={{ activeStep: 'run', phase: 'blocked', direction: 'still' }} />);
    expect(screen.getByTestId('workspace-worker-sprite').dataset.spriteClip).toBe('blocked');
  });
});

describe('front-facing transitions', () => {
  const rects: Record<string, Partial<DOMRect>> = {
    lane: { left: 0, right: 600, width: 600 },
    structured: { left: 0, right: 200, width: 200 },
    build: { left: 200, right: 400, width: 200 },
    run: { left: 400, right: 600, width: 200 },
  };

  function Harness({ guide, runTerminal }: { guide: WorkspaceGuideState; runTerminal: boolean }) {
    const laneRef = useRef<HTMLDivElement>(null);
    const anchorRefs = useRef<Partial<Record<CanvasStep, HTMLButtonElement | null>>>({}) as AnchorRefs;
    return <div ref={laneRef} data-rect="lane">
      <WorkspaceCharacterGuide enabled guide={guide} runTerminal={runTerminal} laneRef={laneRef} anchorRefs={anchorRefs} />
      {(['structured', 'build', 'run'] as const).map((step) => (
        <button key={step} data-rect={step} ref={(element) => { anchorRefs.current[step] = element; }} />
      ))}
    </div>;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rect = rects[this.dataset.rect ?? ''] ?? { left: 0, right: 0, width: 0 };
      return { top: 0, bottom: 112, height: 112, x: rect.left ?? 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect;
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  const onRun: WorkspaceGuideState = { activeStep: 'run', phase: 'complete', direction: 'still' };
  const backToStructured: WorkspaceGuideState = { activeStep: 'structured', phase: 'complete', direction: 'backward' };

  async function mount(guide: WorkspaceGuideState, runTerminal: boolean) {
    const view = render(<Harness guide={guide} runTerminal={runTerminal} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return view;
  }

  const clip = () => screen.getByTestId('workspace-worker-guide').dataset.guideClip;


  it('brakes and turns before folding its arms on a finished Run', async () => {
    const { rerender } = await mount(onRun, false);
    expect(clip()).toBe('success');

    rerender(<Harness guide={onRun} runTerminal />);
    // A beat first, so arriving and turning read as two moments.
    expect(clip()).toBe('success');
    expect(screen.getByTestId('workspace-worker-guide').dataset.guideTargetClip).toBe('crossed_arms');
    advance(300);
    expect(clip()).toBe('to_crossed_arms');
    expect(screen.getByTestId('workspace-worker-sprite').dataset.spriteFrame).not.toBeUndefined();

    // 240ms beat plus a 875ms turn: still turning here, arrived by the end.
    advance(500);
    expect(clip()).toBe('to_crossed_arms');
    advance(600);
    expect(clip()).toBe('crossed_arms');
  });

  it('raises the clipboard when stepping back from a finished Run, then stows it to run again', async () => {
    const { rerender } = await mount(onRun, true);
    advance(2_000);
    expect(clip()).toBe('crossed_arms');

    rerender(<Harness guide={backToStructured} runTerminal />);
    advance(4_000);
    expect(clip()).toBe('review_clipboard');

    // Leaving the review: the clipboard is stowed before any running starts.
    // Leaving a hold turns first, with no beat: the click is answered at once.
    rerender(<Harness guide={{ activeStep: 'build', phase: 'working', direction: 'forward' }} runTerminal />);
    expect(clip()).toBe('to_run');
    advance(1_000);
    expect(clip()).toBe('run');
  });
});


describe('turning before it travels', () => {
  const rects: Record<string, Partial<DOMRect>> = {
    lane: { left: 0, right: 600, width: 600 },
    structured: { left: 0, right: 200, width: 200 },
    build: { left: 200, right: 400, width: 200 },
    run: { left: 400, right: 600, width: 200 },
  };

  function TurnHarness({ guide, runTerminal }: { guide: WorkspaceGuideState; runTerminal: boolean }) {
    const laneRef = useRef<HTMLDivElement>(null);
    const anchorRefs = useRef<Partial<Record<CanvasStep, HTMLButtonElement | null>>>({}) as AnchorRefs;
    return <div ref={laneRef} data-rect="lane">
      <WorkspaceCharacterGuide enabled guide={guide} runTerminal={runTerminal} laneRef={laneRef} anchorRefs={anchorRefs} />
      {(['structured', 'build', 'run'] as const).map((step) => (
        <button key={step} data-rect={step} ref={(element) => { anchorRefs.current[step] = element; }} />
      ))}
    </div>;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rect = rects[this.dataset.rect ?? ''] ?? { left: 0, right: 0, width: 0 };
      return { top: 0, bottom: 112, height: 112, x: rect.left ?? 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect;
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  const box = () => screen.getByTestId('workspace-worker-guide');
  const sprite = () => screen.getByTestId('workspace-worker-sprite');
  const step = (activeStep: CanvasStep, direction: WorkspaceGuideState['direction']): WorkspaceGuideState =>
    ({ activeStep, phase: 'complete', direction });

  async function mount(guide: WorkspaceGuideState, runTerminal: boolean) {
    const view = render(<TurnHarness guide={guide} runTerminal={runTerminal} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return view;
  }


  it('walks the whole chain: standing, turn, run, turn, standing', async () => {
    const { rerender } = await mount(step('run', 'still'), true);
    advance(3_000);
    expect(box().dataset.guideClip).toBe('crossed_arms');

    // Leaving: it squares up and turns back to profile before it moves.
    rerender(<TurnHarness guide={step('structured', 'backward')} runTerminal />);
    expect(box().dataset.guideClip).toBe('to_run_from_stand');
    expect(box().dataset.guideTravelling).toBe('true');

    advance(700);
    expect(box().dataset.guideClip).toBe('run');

    // Arriving: it stops, takes a beat, then turns to face the viewer.
    advance(3_000);
    expect(box().dataset.guideClip).toBe('review_clipboard');
    expect(box().dataset.guideTravelling).toBe('false');
  });

  it('faces the way it travels, in both directions and in every clip', async () => {
    const { rerender } = await mount(step('structured', 'still'), true);
    advance(3_000);
    expect(sprite().dataset.spriteFacing).toBe('1');

    // Rightward to Run: profile art faces right, so it is never mirrored.
    rerender(<TurnHarness guide={step('run', 'forward')} runTerminal />);
    advance(4_000);
    expect(sprite().dataset.spriteFacing).toBe('1');
    expect(box().dataset.guideClip).toBe('crossed_arms');

    // Leftward back to Structured: every clip mirrors, the turn included, so
    // the worker cannot turn one way while running the other.
    rerender(<TurnHarness guide={step('structured', 'backward')} runTerminal />);
    expect(sprite().dataset.spriteFacing).toBe('-1');
    advance(4_000);
    expect(box().dataset.guideClip).toBe('review_clipboard');
    expect(sprite().dataset.spriteFacing).toBe('-1');
  });
});

describe('interrupting a departure turn', () => {
  const rects: Record<string, Partial<DOMRect>> = {
    lane: { left: 0, right: 600, width: 600 },
    structured: { left: 0, right: 200, width: 200 },
    build: { left: 200, right: 400, width: 200 },
    run: { left: 400, right: 600, width: 200 },
  };

  function Harness({ guide, runTerminal = true, workPending = false }: { guide: WorkspaceGuideState; runTerminal?: boolean; workPending?: boolean }) {
    const laneRef = useRef<HTMLDivElement>(null);
    const anchorRefs = useRef<Partial<Record<CanvasStep, HTMLButtonElement | null>>>({}) as AnchorRefs;
    return <div ref={laneRef} data-rect="lane">
      <WorkspaceCharacterGuide enabled guide={guide} runTerminal={runTerminal} workPending={workPending} laneRef={laneRef} anchorRefs={anchorRefs} />
      {(['structured', 'build', 'run'] as const).map((step) => (
        <button key={step} data-rect={step} ref={(element) => { anchorRefs.current[step] = element; }} />
      ))}
    </div>;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rect = rects[this.dataset.rect ?? ''] ?? { left: 0, right: 0, width: 0 };
      return { top: 0, bottom: 112, height: 112, x: rect.left ?? 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect;
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  const box = () => screen.getByTestId('workspace-worker-guide');
  const step = (activeStep: CanvasStep, direction: WorkspaceGuideState['direction'], phase: WorkspaceGuideState['phase'] = 'complete'): WorkspaceGuideState =>
    ({ activeStep, phase, direction });

  async function mount(guide: WorkspaceGuideState, runTerminal = true) {
    const view = render(<Harness guide={guide} runTerminal={runTerminal} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return view;
  }


  it('holds its ground until the turn finishes, however fast the tabs are clicked', async () => {
    const { rerender } = await mount(step('run', 'still'));
    advance(3_000);
    expect(box().dataset.guideClip).toBe('crossed_arms');
    const parked = box().dataset.guideX;

    // First click: the turn starts, the body has not moved yet.
    rerender(<Harness guide={step('build', 'backward')} />);
    expect(box().dataset.guideClip).toBe('to_run_from_stand');
    expect(box().dataset.guideX).toBe(parked);

    // Second click part-way through that turn must not release the move early:
    // that is what made the worker slide sideways while still facing front.
    advance(300);
    rerender(<Harness guide={step('structured', 'backward')} />);
    expect(box().dataset.guideX).toBe(parked);
    advance(200);
    expect(box().dataset.guideX).toBe(parked);

    // Once the turn is done it runs, and it ends up at the tab it was last sent to.
    advance(400);
    expect(box().dataset.guideClip).toBe('run');
    expect(box().dataset.guideX).not.toBe(parked);
    advance(4_000);
    expect(box().dataset.guideClip).toBe('review_clipboard');
    expect(Number(box().dataset.guideX)).toBeLessThan(Number(parked));
  });

  it('keeps running while any step of the pipeline is unfinished', async () => {
    // Nothing built yet, or a Build ready but unapproved: the pipeline is still
    // mid-flight, so the worker works rather than waits -- wherever it stands.
    const { rerender } = await mount(step('structured', 'still'), false);
    advance(2_000);
    expect(box().dataset.guideClip).toBe('point');

    rerender(<Harness guide={step('build', 'forward')} runTerminal={false} workPending />);
    advance(3_000);
    expect(box().dataset.guideTravelling).toBe('false');
    expect(box().dataset.guideClip).toBe('run');
    expect(box().dataset.guideRunningInPlace).toBe('true');

    const parked = box().dataset.guideX;
    advance(2_000);
    expect(box().dataset.guideX).toBe(parked);

    // Once the step completes it settles.
    rerender(<Harness guide={step('build', 'still')} runTerminal={false} />);
    advance(2_000);
    expect(box().dataset.guideClip).toBe('point');
  });

  it('runs on the spot for unknown Build progress, without sliding the body', async () => {
    const { rerender } = await mount(step('run', 'still'));
    advance(3_000);
    rerender(<Harness guide={step('build', 'backward', 'working')} />);
    // The turn comes first, and the body must not move during it.
    expect(box().dataset.guideClip).toBe('to_run_from_stand');
    expect(box().dataset.guideRunningInPlace).toBe('false');

    advance(700);
    expect(box().dataset.guideClip).toBe('run');
    expect(box().dataset.guideRunningInPlace).toBe('false');

    advance(3_000);
    expect(box().dataset.guideTravelling).toBe('false');
    expect(box().dataset.guideRunningInPlace).toBe('true');

    // Running on the spot means exactly that: the gait plays, x does not move.
    const parked = box().dataset.guideX;
    advance(2_000);
    expect(box().dataset.guideClip).toBe('run');
    expect(box().dataset.guideX).toBe(parked);
  });

  it('unwinds a turn that is interrupted, instead of sliding away facing front', async () => {
    const { rerender } = await mount(step('run', 'still'));
    advance(3_000);

    // Step back so it arrives at Structured and starts turning to the viewer.
    rerender(<Harness guide={step('structured', 'backward')} />);
    advance(2_500);
    expect(box().dataset.guideClip).toBe('to_review');
    const parked = box().dataset.guideX;

    // Click away mid-turn: it rotates back out of the angle it reached, and
    // the body stays put until it is side-on again.
    advance(250);
    rerender(<Harness guide={step('run', 'forward')} />);
    expect(box().dataset.guideClip).toBe('to_run_from_stand');
    expect(box().dataset.guideX).toBe(parked);

    advance(200);
    expect(box().dataset.guideX).toBe(parked);

    advance(600);
    expect(box().dataset.guideClip).toBe('run');
    expect(Number(box().dataset.guideX)).toBeGreaterThan(Number(parked));
  });
});
