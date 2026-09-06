import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceCanvas } from '../../../src/components/forge/WorkspaceCanvas';
import type { CanvasStepView } from '../../../src/components/forge/workspaceCanvasModel';

const steps: CanvasStepView[] = [
  { id: 'structured', labelKey: 'canvas.step.structured', state: 'complete' },
  { id: 'build', labelKey: 'canvas.step.build', state: 'available', reasonKey: 'canvas.buildWorking' },
  { id: 'run', labelKey: 'canvas.step.run', state: 'locked', reasonKey: 'canvas.runNeedsApproval' },
];

describe('WorkspaceCanvas', () => {
  it('always exposes three steps and explains locked future work', () => {
    const onStepChange = vi.fn();
    render(<WorkspaceCanvas
      steps={steps}
      activeStep="structured"
      guide={{ activeStep: 'structured', phase: 'complete', direction: 'still' }}
      onStepChange={onStepChange}
      presentation="split"
      onPresentationChange={vi.fn()}
      onClose={vi.fn()}
      structured={<div>Structured content</div>}
      build={<div>Build content</div>}
      run={<div>Run content</div>}
    />);

    expect(screen.getByRole('tablist', { name: 'Workbench views' })).toBeDefined();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect((screen.getByRole('tab', { name: /Lượt chạy/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Cần duyệt đúng Bản dựng hiện tại trước khi chạy.')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: /^Bản dựng/ }));
    expect(onStepChange).toHaveBeenCalledWith('build');
    expect(screen.getByTestId('canvas-guide-anchor-structured')).toBeDefined();
    expect(screen.getByTestId('canvas-guide-anchor-build')).toBeDefined();
    expect(screen.getByTestId('canvas-guide-anchor-run')).toBeDefined();
  });

  it('expands from split mode and closes independently', () => {
    const onPresentationChange = vi.fn();
    const onClose = vi.fn();
    render(<WorkspaceCanvas
      steps={steps}
      activeStep="build"
      guide={{ activeStep: 'build', phase: 'complete', direction: 'forward' }}
      onStepChange={vi.fn()}
      presentation="split"
      onPresentationChange={onPresentationChange}
      onClose={onClose}
      structured={<div />}
      build={<div>Build content</div>}
      run={<div />}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Phóng to canvas' }));
    expect(onPresentationChange).toHaveBeenCalledWith('fullscreen');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng canvas' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Build content')).toBeDefined();
  });

  it('collapses fullscreen with its toolbar control or Escape', () => {
    const onPresentationChange = vi.fn();
    render(<WorkspaceCanvas
      steps={steps}
      activeStep="build"
      guide={{ activeStep: 'build', phase: 'complete', direction: 'still' }}
      onStepChange={vi.fn()}
      presentation="fullscreen"
      onPresentationChange={onPresentationChange}
      onClose={vi.fn()}
      structured={<div />}
      build={<div>Build content</div>}
      run={<div />}
    />);

    // Fullscreen removes surrounding chrome, not the readable working
    // measure. The canvas content stays centred and bounded on ultrawide
    // displays instead of stretching every form control edge-to-edge.
    expect(screen.getByTestId('canvas-content-frame').className).toContain('max-w-[80rem]');

    fireEvent.click(screen.getByRole('button', { name: 'Thu canvas về panel' }));
    expect(onPresentationChange).toHaveBeenCalledWith('split');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onPresentationChange).toHaveBeenLastCalledWith('split');
  });

  it('does not expose redundant fullscreen controls on compact layouts', () => {
    render(<WorkspaceCanvas
      steps={steps}
      activeStep="structured"
      guide={{ activeStep: 'structured', phase: 'complete', direction: 'still' }}
      onStepChange={vi.fn()}
      presentation="split"
      fullscreenAvailable={false}
      onPresentationChange={vi.fn()}
      onClose={vi.fn()}
      structured={<div>Structured content</div>}
      build={<div />}
      run={<div />}
    />);

    expect(screen.queryByRole('button', { name: 'Phóng to canvas' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đóng canvas' })).toBeDefined();
  });

  it('keeps one decorative worker guide mounted above the measured step toolbar', () => {
    const { rerender } = render(<WorkspaceCanvas
      steps={steps}
      activeStep="structured"
      guide={{ activeStep: 'structured', phase: 'complete', direction: 'still' }}
      onStepChange={vi.fn()}
      presentation="split"
      onPresentationChange={vi.fn()}
      onClose={vi.fn()}
      structured={<div />}
      build={<div />}
      run={<div />}
    />);

    const guide = screen.getByTestId('workspace-worker-guide');
    expect(guide.getAttribute('aria-hidden')).toBe('true');
    expect((guide as HTMLElement).hidden).toBe(false);
    expect(guide.className).toContain('pointer-events-none');
    expect(screen.getByTestId('workspace-guide-lane').className).toContain('h-[126px]');
    expect(screen.getByTestId('workspace-guide-lane').compareDocumentPosition(screen.getByRole('tablist', { name: 'Workbench views' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<WorkspaceCanvas
      steps={steps}
      activeStep="build"
      guide={{ activeStep: 'build', phase: 'working', direction: 'forward' }}
      onStepChange={vi.fn()}
      presentation="split"
      onPresentationChange={vi.fn()}
      onClose={vi.fn()}
      structured={<div />}
      build={<div />}
      run={<div />}
    />);

    expect(screen.getByTestId('workspace-worker-guide')).toBe(guide);
  });

  it('passes only provider-backed Run progress to the worker guide', () => {
    render(<WorkspaceCanvas
      steps={[...steps.slice(0, 2), { id: 'run', labelKey: 'canvas.step.run', state: 'working' }]}
      activeStep="run"
      guide={{ activeStep: 'run', phase: 'working', direction: 'forward' }}
      runProgress={{ completedSteps: 2, totalSteps: 4 }}
      onStepChange={vi.fn()}
      presentation="split"
      onPresentationChange={vi.fn()}
      onClose={vi.fn()}
      structured={<div />}
      build={<div />}
      run={<div />}
    />);

    expect(screen.getByTestId('workspace-worker-guide').getAttribute('data-guide-progress')).toBe('0.5');
  });
});
