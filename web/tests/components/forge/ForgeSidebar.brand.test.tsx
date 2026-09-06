import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForgeSidebar } from '@/components/forge/ForgeSidebar';

vi.mock('@/components/forge/AccountMenu', () => ({
  AccountMenu: () => <div />,
}));

const props = {
  active: 'workspace',
  selectedScenario: '',
  onToggle: vi.fn(),
  onSelect: vi.fn(),
  onNewScenario: vi.fn(),
  onSelectScenario: vi.fn(),
  modal: false,
  sidebarRef: createRef<HTMLElement>(),
  onSidebarKeyDown: vi.fn(),
  onOpenSettings: vi.fn(),
};

describe('ForgeSidebar brand', () => {
  it('uses the shared vector mark in expanded and collapsed states', () => {
    const { rerender } = render(<ForgeSidebar {...props} open />);
    expect(screen.getByTestId('sidebar-brand-mark').getAttribute('src')).toBe('/brand/worker-avatar.png');

    rerender(<ForgeSidebar {...props} open={false} />);
    expect(screen.getByTestId('sidebar-brand-mark').getAttribute('src')).toBe('/brand/worker-avatar.png');
    expect(screen.getByText('Scenario Forge')).toBeDefined();
  });
});
