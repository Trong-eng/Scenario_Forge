import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DefinitionPanel } from '../../../src/components/forge/DefinitionPanel';
import type { FieldGroup } from '../../../src/components/forge/definitionModel';

const groups: FieldGroup[] = [{
  id: 'global',
  title: 'Global',
  fields: [{ id: 'map', label: 'Map', value: 'Town05', provenance: 'grounded' }],
}];

describe('DefinitionPanel', () => {
  it('keeps Structured fields primary and owns the next Build action without a Scenic navigation view', () => {
    const onGroundAndBuild = vi.fn();
    render(<DefinitionPanel
      tab="structured"
      availableTabs={['structured']}
      groups={groups}
      inspectorOpen={false}
      inspectorAvailable={false}
      onTabChange={vi.fn()}
      onFieldChange={vi.fn()}
      onCompare={vi.fn()}
      onSubmit={vi.fn()}
      pendingEdits={0}
      onOpenInspector={vi.fn()}
      onGroundAndBuild={onGroundAndBuild}
    />);

    expect(screen.getByText('Town05')).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'Scenic code' })).toBeNull();
    expect(screen.queryByText('param map = "Town05"')).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Definition views' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Neo và dựng Scenic' }));
    expect(onGroundAndBuild).toHaveBeenCalledTimes(1);
  });
});

describe('DefinitionPanel footer actions', () => {
  const renderFooter = (pendingEdits: number, handlers: { onSubmit?: () => void; onGroundAndBuild?: () => void } = {}) => render(<DefinitionPanel
    tab="structured"
    availableTabs={['structured']}
    groups={groups}
    inspectorOpen={false}
    inspectorAvailable={false}
    onTabChange={vi.fn()}
    onFieldChange={vi.fn()}
    onCompare={vi.fn()}
    onSubmit={handlers.onSubmit ?? vi.fn()}
    pendingEdits={pendingEdits}
    onOpenInspector={vi.fn()}
    onGroundAndBuild={handlers.onGroundAndBuild ?? vi.fn()}
  />);

  it('offers one live action at a time: submit while edits are pending, build once they are not', () => {
    const { unmount } = renderFooter(0);
    // Nothing changed: submitting would report success over no work.
    expect(screen.getByRole('button', { name: 'Gửi thay đổi' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Neo và dựng Scenic' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('Không có thay đổi chưa gửi')).toBeDefined();
    unmount();

    renderFooter(2);
    // Pending edits: the build waits, because it would ground the values the
    // operator has just moved away from.
    expect(screen.getByRole('button', { name: 'Gửi thay đổi' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Neo và dựng Scenic' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('2 thay đổi chưa gửi')).toBeDefined();
  });

  it('keeps a forward action once a Build exists, without offering to ground again', () => {
    const onOpenBuild = vi.fn();
    render(<DefinitionPanel
      tab="structured"
      availableTabs={['structured']}
      groups={groups}
      inspectorOpen={false}
      inspectorAvailable={false}
      onTabChange={vi.fn()}
      onFieldChange={vi.fn()}
      onCompare={vi.fn()}
      onSubmit={vi.fn()}
      pendingEdits={0}
      onOpenInspector={vi.fn()}
      onOpenBuild={onOpenBuild}
    />);

    // Grounding again would rebuild the same Definition, so the step is opened
    // instead — and the footer is never left without a way forward.
    expect(screen.queryByRole('button', { name: 'Neo và dựng Scenic' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sang bước Bản dựng' }));
    expect(onOpenBuild).toHaveBeenCalledTimes(1);
  });

  it('submits only when something is actually pending', () => {
    const onSubmit = vi.fn();
    const { unmount } = renderFooter(0, { onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thay đổi' }));
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();

    renderFooter(1, { onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thay đổi' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
