import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSplitLayout } from '../../../src/components/forge/WorkspaceSplitLayout';

describe('WorkspaceSplitLayout', () => {
  it('renders a keyboard-operable desktop separator and clamps chat sizing', () => {
    const onChatFractionChange = vi.fn();
    render(<WorkspaceSplitLayout
      measuredWidth={1440}
      canvasOpen
      chatFraction={0.25}
      onChatFractionChange={onChatFractionChange}
      chat={<div>Chat surface</div>}
      canvas={<div>Canvas surface</div>}
    />);

    const separator = screen.getByRole('separator', { name: 'Thay đổi kích thước Chat và Canvas' });
    expect(separator.getAttribute('aria-valuenow')).toBe('360');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(onChatFractionChange).toHaveBeenCalledWith(400 / 1440);
    fireEvent.keyDown(separator, { key: 'End' });
    expect(onChatFractionChange).toHaveBeenCalledWith(720 / 1440);
    expect(screen.getByTestId('workspace-canvas-pane').className).not.toContain('p-3');
  });

  it('uses a Chat / Canvas switcher below 960px without unmounting either surface', () => {
    const { rerender } = render(<WorkspaceSplitLayout
      measuredWidth={900}
      canvasOpen
      chatFraction={0.38}
      compactSurface="chat"
      onCompactSurfaceChange={vi.fn()}
      onChatFractionChange={vi.fn()}
      chat={<div>Chat state stays mounted</div>}
      canvas={<div>Canvas state stays mounted</div>}
    />);

    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    expect(chatTab.getAttribute('aria-selected')).toBe('true');
    expect(chatTab.getAttribute('id')).toBe('workspace-tab-chat');
    expect(screen.getByRole('tabpanel', { name: 'Chat' }).getAttribute('aria-labelledby')).toBe('workspace-tab-chat');
    expect(screen.getByText('Chat state stays mounted')).toBeDefined();
    expect(screen.getByText('Canvas state stays mounted')).toBeDefined();

    rerender(<WorkspaceSplitLayout
      measuredWidth={900}
      canvasOpen
      chatFraction={0.38}
      compactSurface="canvas"
      onCompactSurfaceChange={vi.fn()}
      onChatFractionChange={vi.fn()}
      chat={<div>Chat state stays mounted</div>}
      canvas={<div>Canvas state stays mounted</div>}
    />);
    expect(screen.getByRole('tab', { name: 'Canvas' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('workspace-canvas-pane').className).not.toContain('p-3');
  });

  it('switches to compact at 968px, reports the mode, and exposes the true constrained desktop maximum', async () => {
    const onChatFractionChange = vi.fn();
    const onLayoutModeChange = vi.fn();
    const { rerender } = render(<WorkspaceSplitLayout
      measuredWidth={968}
      canvasOpen
      chatFraction={0.38}
      onChatFractionChange={onChatFractionChange}
      onLayoutModeChange={onLayoutModeChange}
      chat={<div>Chat surface</div>}
      canvas={<div>Canvas surface</div>}
    />);

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Workspace surfaces' })).toBeDefined();
    await waitFor(() => expect(onLayoutModeChange).toHaveBeenLastCalledWith(true));

    rerender(<WorkspaceSplitLayout
      measuredWidth={1000}
      canvasOpen
      chatFraction={0.62}
      onChatFractionChange={onChatFractionChange}
      onLayoutModeChange={onLayoutModeChange}
      chat={<div>Chat surface</div>}
      canvas={<div>Canvas surface</div>}
    />);
    const separator = screen.getByRole('separator', { name: 'Thay đổi kích thước Chat và Canvas' });
    expect(separator.getAttribute('aria-valuemax')).toBe('351');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(onChatFractionChange).toHaveBeenLastCalledWith(351 / 1000);
    await waitFor(() => expect(onLayoutModeChange).toHaveBeenLastCalledWith(false));
  });

  it('keeps the desktop surfaces mounted and exposes a right-edge enter/exit state', () => {
    const { rerender } = render(<WorkspaceSplitLayout
      measuredWidth={1440}
      canvasOpen={false}
      chatFraction={0.38}
      onChatFractionChange={vi.fn()}
      chat={<div>Full chat intake</div>}
      canvas={<div>Hidden canvas</div>}
    />);

    expect(screen.getByText('Full chat intake')).toBeDefined();
    const canvasPane = screen.getByTestId('workspace-canvas-pane');
    const mountedCanvas = screen.getByText('Hidden canvas');
    expect(canvasPane.getAttribute('data-motion-state')).toBe('closed');
    expect(canvasPane.getAttribute('aria-hidden')).toBe('true');
    expect(canvasPane.hasAttribute('inert')).toBe(true);
    expect(canvasPane.className).toContain('translate-x-6');
    expect(canvasPane.className).toContain('opacity-0');
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở canvas' })).toBeNull();

    rerender(<WorkspaceSplitLayout
      measuredWidth={1440}
      canvasOpen
      chatFraction={0.38}
      onChatFractionChange={vi.fn()}
      chat={<div>Full chat intake</div>}
      canvas={<div>Hidden canvas</div>}
    />);

    expect(screen.getByText('Hidden canvas')).toBe(mountedCanvas);
    expect(canvasPane.getAttribute('data-motion-state')).toBe('open');
    expect(canvasPane.getAttribute('aria-hidden')).toBe('false');
    expect(canvasPane.hasAttribute('inert')).toBe(false);
    expect(canvasPane.className).toContain('transform-none');
    expect(canvasPane.className).not.toContain('translate-x-0');
    expect(canvasPane.className).toContain('opacity-100');
    expect(screen.getByRole('separator')).toBeDefined();
  });

  it('keeps split tracks proportional while the surrounding sidebar resizes', () => {
    const { container, rerender } = render(<WorkspaceSplitLayout
      measuredWidth={1440}
      canvasOpen
      chatFraction={0.38}
      onChatFractionChange={vi.fn()}
      chat={<div>Fluid chat</div>}
      canvas={<div>Fluid canvas</div>}
    />);

    const split = container.firstElementChild as HTMLElement;
    const initialTracks = split.style.gridTemplateColumns;
    expect(initialTracks).toContain('38%');

    rerender(<WorkspaceSplitLayout
      measuredWidth={1176}
      canvasOpen
      chatFraction={0.38}
      onChatFractionChange={vi.fn()}
      chat={<div>Fluid chat</div>}
      canvas={<div>Fluid canvas</div>}
    />);

    // A parent-only resize must not generate a new pixel target that restarts
    // the 280ms Canvas transition on every ResizeObserver notification.
    expect(split.style.gridTemplateColumns).toBe(initialTracks);
  });
});
