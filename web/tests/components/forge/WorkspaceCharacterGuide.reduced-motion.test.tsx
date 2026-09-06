import { useRef, type MutableRefObject } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// motion/react resolves its reduced-motion query once per module instance, so
// this case needs its own file rather than a matchMedia stub mid-suite.
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}));

import { WorkspaceCharacterGuide } from '../../../src/components/forge/WorkspaceCharacterGuide';
import type { CanvasStep, WorkspaceGuideState } from '../../../src/components/forge/workspaceCanvasModel';

type AnchorRefs = MutableRefObject<Partial<Record<CanvasStep, HTMLButtonElement | null>>>;

function Harness({ guide, runTerminal }: { guide: WorkspaceGuideState; runTerminal: boolean }) {
  const laneRef = useRef<HTMLDivElement>(null);
  const anchorRefs = useRef<Partial<Record<CanvasStep, HTMLButtonElement | null>>>({}) as AnchorRefs;
  return <div ref={laneRef}>
    <WorkspaceCharacterGuide enabled guide={guide} runTerminal={runTerminal} laneRef={laneRef} anchorRefs={anchorRefs} />
  </div>;
}

const onRun: WorkspaceGuideState = { activeStep: 'run', phase: 'complete', direction: 'still' };

beforeEach(() => {
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('worker guide under reduced motion', () => {
  it('cuts straight to the destination pose instead of playing a transition', async () => {
    const { rerender } = render(<Harness guide={onRun} runTerminal={false} />);
    // The runtime is a lazy chunk; a macrotask is the reliable way to let it land.
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
    expect(screen.getByTestId('workspace-worker-guide').dataset.guideClip).toBe('success');

    rerender(<Harness guide={onRun} runTerminal />);
    expect(screen.getByTestId('workspace-worker-guide').dataset.guideClip).toBe('crossed_arms');

    rerender(<Harness guide={{ activeStep: 'structured', phase: 'complete', direction: 'backward' }} runTerminal />);
    expect(screen.getByTestId('workspace-worker-guide').dataset.guideClip).toBe('review_clipboard');
    // Clip identity is the assertion that matters here; the sprite surface's
    // own reduced-motion behaviour is covered in the main runtime suite.
  });
});
