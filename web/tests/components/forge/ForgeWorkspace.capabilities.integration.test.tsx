import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgeWorkspace } from '../../../src/components/forge/ForgeWorkspace';
import { apiClient, createProjectSession } from '../../../src/shared/api/client';
import {
  CAPABILITY_SCHEMA_VERSION,
  CAPABILITY_SET_VERSION,
  type CapabilityCheckResult,
  type CapabilityListResult,
  type CapabilityMetadataItem,
} from '../../../src/shared/api/capabilityTypes';
import type { AgentThread } from '../../../src/shared/api/agentTypes';

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>(
    '../../../src/shared/api/client',
  );
  return {
    ...actual,
    apiClient: Object.fromEntries(Object.keys(actual.apiClient).map((key) => [key, vi.fn()])),
    createProjectSession: vi.fn(),
  };
});

const thread: AgentThread = {
  thread_id: 'thread-capability',
  project_id: 'project-1',
  status: 'active',
  title: 'Capability handoff',
  summary: 'A crossing scenario',
  turn_count: 0,
  created_at: '2026-08-28T00:00:00Z',
  updated_at: '2026-08-28T00:00:00Z',
  correlation_id: 'corr-thread',
};

const crossing: CapabilityMetadataItem = {
  capability_id: 'crossing',
  kind: 'pattern',
  display_name: 'Pedestrian crossing',
  status: 'stable',
  support_state: 'authorable',
  evidence_level: 'static_validated',
  required_fields: ['target_speed'],
  supported_actor_types: ['Car', 'Pedestrian'],
  supported_topologies: ['straight_road'],
  expected_events: ['avoidance', 'completion'],
  allowed_next_actions: ['preview', 'build'],
};

const overtake: CapabilityMetadataItem = {
  capability_id: 'overtake',
  kind: 'primitive',
  display_name: 'Overtake a slower vehicle',
  status: 'planned',
  support_state: 'planned',
  evidence_level: 'parsed',
  required_fields: [],
  supported_actor_types: ['Car'],
  supported_topologies: ['multi_lane_road'],
  expected_events: ['overtake', 'order_flip'],
  allowed_next_actions: ['use_current', 'stop'],
};

const capabilities: CapabilityListResult = {
  operation: 'scenario.capabilities.list',
  schema_version: CAPABILITY_SCHEMA_VERSION,
  capability_set_version: CAPABILITY_SET_VERSION,
  query_id: 'capability-query:workspace',
  scope: { project_id: 'project-1', actor_ref: 'actor-1' },
  status: 'available',
  items: [crossing, overtake],
  allowed_next_actions: ['preview', 'build', 'use_current'],
  summary: 'Registry metadata is available.',
  error_code: null,
};

const overtakeCheck: CapabilityCheckResult = {
  operation: 'scenario.capabilities.check',
  schema_version: CAPABILITY_SCHEMA_VERSION,
  capability_set_version: CAPABILITY_SET_VERSION,
  query_id: 'capability-query:workspace-check',
  scope: { project_id: 'project-1', actor_ref: 'actor-1' },
  check: 'unsupported',
  involved_ids: ['overtake'],
  items: [overtake],
  missing_fields: [],
  incompatible_pairs: [],
  safe_alternatives: ['crossing'],
  allowed_next_actions: ['use_current', 'stop'],
  summary: 'Planned capability remains non-executable.',
  error_code: 'CAPABILITY_NOT_EXECUTABLE',
};

describe('ForgeWorkspace capability handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(createProjectSession).mockResolvedValue({
      project_id: 'project-1',
      project_token: 'project-token',
      permissions: [],
    });
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({
      project_id: 'project-1', items: [], next_cursor: null,
    } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({
      project_id: 'project-1', items: [], next_cursor: null,
    } as never);
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [], next_cursor: null, correlation_id: 'corr-list',
    });
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({
      items: [], correlation_id: 'corr-transcript',
    });
    vi.mocked(apiClient.getCapabilities).mockResolvedValue(capabilities as never);
    vi.mocked(apiClient.checkCapabilities).mockResolvedValue(overtakeCheck);
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('uses real metadata, discloses planned capabilities, and hands only a canonical intent to Agent', async () => {
    render(<ForgeWorkspace />);

    await waitFor(() => expect(apiClient.getCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', projectToken: 'project-token' }),
      { include_planned: true, include_experimental: true },
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Mở Năng lực' }));
    expect(await screen.findByRole('dialog', { name: 'Capabilities' })).toBeDefined();

    expect(await screen.findByTestId('capabilities-ready')).toBeDefined();
    const plannedRow = screen.getByTestId('capability-overtake');
    expect(plannedRow.getAttribute('data-capability-selectable')).toBe('false');
    expect((screen.getByTestId('capability-use-overtake') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('capability-toggle-overtake'));
    expect(screen.getByTestId('capability-planned-note-overtake')).toBeDefined();
    await waitFor(() => expect(apiClient.checkCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', projectToken: 'project-token' }),
      { capability_ids: ['overtake'], capability_set_version: CAPABILITY_SET_VERSION },
    ));

    fireEvent.click(screen.getByTestId('capability-use-crossing'));

    const goal = await screen.findByLabelText('Agent goal');
    await waitFor(() => expect((goal as HTMLInputElement).value).toBe('kịch bản: crossing'));
    expect(apiClient.createAgentThread).not.toHaveBeenCalled();
    expect(apiClient.createProviderDefinition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    await waitFor(() => expect(apiClient.createAgentThread).toHaveBeenCalledWith(
      'kịch bản: crossing',
      expect.objectContaining({ projectId: 'project-1', projectToken: 'project-token' }),
    ));
    expect(apiClient.createProviderDefinition).not.toHaveBeenCalled();
    expect(apiClient.createProviderBuild).not.toHaveBeenCalled();
    expect(apiClient.createRun).not.toHaveBeenCalled();
  });
});
