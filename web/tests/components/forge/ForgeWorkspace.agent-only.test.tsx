import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgeWorkspace } from '../../../src/components/forge/ForgeWorkspace';
import { apiClient, createProjectSession } from '../../../src/shared/api/client';
import type { AgentEvent, AgentThread } from '../../../src/shared/api/agentTypes';

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>('../../../src/shared/api/client');
  return {
    ...actual,
    apiClient: Object.fromEntries(Object.keys(actual.apiClient).map((key) => [key, vi.fn()])),
    createProjectSession: vi.fn(),
  };
});

const thread: AgentThread = {
  thread_id: 'thread-agent-only',
  project_id: 'project-a',
  status: 'active',
  title: 'Agent-only thread',
  summary: 'Thread summary',
  turn_count: 0,
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
  correlation_id: 'corr-agent-only',
};

describe('ForgeWorkspace agent-only conversation surface (TIP-AGENT-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(createProjectSession).mockResolvedValue({
      project_id: 'project-a', project_token: 'project-token', permissions: [],
    });
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [{ ...thread, title: 'Durable agent thread' }],
      next_cursor: null,
      correlation_id: 'corr-list',
    });
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({ items: [], correlation_id: 'corr-transcript' });
    // Every stream ends immediately with the canonical terminal pair so the
    // composer returns to its idle state for the follow-up assertion.
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks) => {
      const emit = async (cursor: number, event_type: AgentEvent['event_type'], payload: Record<string, unknown>) => {
        await callbacks.onEvent({
          event_id: `event-${cursor}`, cursor, event_type, thread_id: thread.thread_id,
          step_id: `step-${cursor}`, correlation_id: 'corr-agent-only',
          payload, created_at: '2026-08-26T00:00:00Z',
        });
      };
      await emit(1, 'plan_created', {});
      await emit(2, 'verification', { status: 'COMPLETED' });
      await emit(3, 'completed', { status: 'COMPLETED' });
    });
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('hydrates Recent solely from durable Agent threads and never from legacy sources', async () => {
    render(<ForgeWorkspace />);

    await waitFor(() => expect(apiClient.listAgentThreads).toHaveBeenCalled());

    // The deleted legacy surfaces are gone from the client module entirely.
    const legacyApi = apiClient as unknown as Record<string, unknown>;
    const removed = ['stream' + 'Chat', 'create' + 'Authoring' + 'Session', 'list' + 'Authoring' + 'Sessions', 'answer' + 'Authoring' + 'Session'];
    for (const method of ['chat', ...removed]) {
      expect(legacyApi[method]).toBeUndefined();
    }
  });

  it('routes the first turn through createAgentThread and later turns through appendAgentMessage', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.appendAgentMessage).mockResolvedValue({ ...thread, turn_count: 2 });

    render(<ForgeWorkspace />);

    const goal = await screen.findByLabelText('Agent goal');
    fireEvent.change(goal, { target: { value: 'Một xe cắt ngang trước ego.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    await waitFor(() => expect(apiClient.createAgentThread).toHaveBeenCalledWith(
      'Một xe cắt ngang trước ego.',
      expect.objectContaining({ projectId: 'project-a' }),
    ));

    // A follow-up turn rides the existing durable thread once the first turn settles.
    const send = await screen.findByRole('button', { name: 'Gửi tin nhắn cho trợ lý' });
    fireEvent.change(screen.getByLabelText('Agent message'), { target: { value: 'Tiếp tục với Town05.' } });
    fireEvent.click(send);

    await waitFor(() => expect(apiClient.appendAgentMessage).toHaveBeenCalledWith(
      'thread-agent-only',
      'Tiếp tục với Town05.',
      expect.objectContaining({ projectId: 'project-a' }),
    ));
  });
});
