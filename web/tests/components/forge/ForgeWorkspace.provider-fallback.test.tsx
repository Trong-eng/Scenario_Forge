import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ForgeWorkspace } from '../../../src/components/forge/ForgeWorkspace';
import { apiClient, createProjectSession } from '../../../src/shared/api/client';

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>(
    '../../../src/shared/api/client',
  );
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      listDefinitions: vi.fn(),
      getRegistry: vi.fn(),
    },
    createProjectSession: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps the approved new workspace shell when the provider is unavailable', async () => {
  vi.mocked(createProjectSession).mockRejectedValue(
    new Error('Scenario Forge control plane is unavailable'),
  );

  render(<ForgeWorkspace />);

  await waitFor(() => expect(createProjectSession).toHaveBeenCalledOnce());
  expect(screen.queryByRole('banner')).toBeNull();
  expect(screen.queryByText('Motorcycle Crossing in Rain')).toBeNull();
  expect(screen.queryByText('Pedestrian Occlusion at Dusk')).toBeNull();
  expect(screen.queryByText('Values assumed')).toBeNull();
  expect(screen.getByRole('main').getAttribute('data-stage')).toBe('intake');
});

it('announces when the real project provider is ready', async () => {
  vi.mocked(createProjectSession).mockResolvedValue({
    project_id: 'project-a', project_token: 'project-token', permissions: [],
  });
  vi.mocked(apiClient.listDefinitions).mockResolvedValue({
    project_id: 'project-a', items: [], next_cursor: null,
  } as never);
  vi.mocked(apiClient.getRegistry).mockResolvedValue({
    project_id: 'project-a', items: [], next_cursor: null,
  } as never);

  render(<ForgeWorkspace />);

  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toContain('Scenario Forge provider ready');
  });
});
