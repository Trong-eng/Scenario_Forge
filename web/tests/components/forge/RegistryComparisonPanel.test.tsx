import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RegistryComparisonPanel } from '../../../src/components/forge/RegistryComparisonPanel';

afterEach(cleanup);

it('renders provider comparison groups and exposes a close action', () => {
  const onClose = vi.fn();
  render(<RegistryComparisonPanel
    comparison={{
      project_id: 'project-a',
      left_build_id: 'build-1',
      right_build_id: 'build-2',
      definition_changes: ['description'],
      variant_changes: [],
      build_changes: ['manifest_hash'],
      run_changes: ['seed'],
      evaluation_changes: [],
      scenic_claims: ['map'],
    }}
    onClose={onClose}
  />);

  expect(screen.getByRole('heading', { name: 'Build changes' })).toBeDefined();
  expect(screen.getByText('manifest_hash')).toBeDefined();
  expect(screen.getByText('build-1 → build-2')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }));
  expect(onClose).toHaveBeenCalledOnce();
});
