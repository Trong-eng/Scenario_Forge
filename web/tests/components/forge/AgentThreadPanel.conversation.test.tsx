import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentThreadPanel } from '../../../src/components/forge/AgentThreadPanel';
import { apiClient } from '../../../src/shared/api/client';
import type { AgentEvent, AgentThread } from '../../../src/shared/api/agentTypes';

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>('../../../src/shared/api/client');
  return {
    ...actual,
    apiClient: Object.fromEntries(Object.keys(actual.apiClient).map((key) => [key, vi.fn()])),
  };
});

const session = { projectId: 'project-panel', projectToken: 'panel-token' };

const thread: AgentThread = {
  thread_id: 'thread-panel',
  project_id: 'project-panel',
  status: 'active',
  title: 'Panel thread',
  summary: 'Thread summary',
  turn_count: 0,
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
  correlation_id: 'corr-panel',
};

const event = (
  cursor: number,
  event_type: AgentEvent['event_type'],
  payload: Record<string, unknown>,
): AgentEvent => ({
  event_id: `event-${cursor}`,
  cursor,
  event_type,
  thread_id: thread.thread_id,
  step_id: `step-${cursor}`,
  correlation_id: 'corr-panel',
  payload,
  created_at: '2026-08-26T00:00:00Z',
});

/** Terminal pair every turn ends with so the composer returns to idle. */
async function completeStream(cursorBase: number) {
  const callbacks = lastStreamCallbacks();
  await act(async () => {
    await callbacks.onEvent(event(cursorBase + 1, 'plan_created', {}));
    await callbacks.onEvent(event(cursorBase + 2, 'verification', { status: 'COMPLETED' }));
    await callbacks.onEvent(event(cursorBase + 3, 'completed', { status: 'COMPLETED' }));
  });
}

type StreamCallbacks = Parameters<
  typeof import('../../../src/shared/api/client').apiClient.streamAgentEvents
>[2];

let streamRef: StreamCallbacks | null = null;

function lastStreamCallbacks(): StreamCallbacks {
  if (streamRef === null) throw new Error('stream has not started');
  return streamRef;
}

describe('AgentThreadPanel conversation surface (TIP-AGENT-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamRef = null;
    window.localStorage.clear();
    vi.mocked(apiClient.getAgentBudgetProgress).mockResolvedValue({
      schema_version: '1.0.0',
      project_id: session.projectId,
      thread_id: thread.thread_id,
      subject_user_id: 'user-1',
      model_calls_used: 0,
      model_call_limit: 10,
      question_limit: 10,
      questions_used: 0,
      answer_storage_used: 0,
      answer_storage_limit: 10,
      policy_source: 'default',
      updated_at: '2026-08-26T00:00:00Z',
      correlation_id: 'corr-budget',
    } as never);
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.appendAgentMessage).mockResolvedValue({ ...thread, turn_count: 1 });
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks) => {
      streamRef = callbacks;
    });
  });

  afterEach(() => {
    cleanup();
  });

  function renderPanel(extraProps: Record<string, unknown> = {}) {
    render(<AgentThreadPanel session={session} {...extraProps} />);
  }

  it('opens Canvas from a Definition artifact in the conversation', () => {
    const onOpenCanvas = vi.fn();
    renderPanel({
      onOpenCanvas,
      canvasArtifact: {
        title: 'Definition v2',
        description: 'Build đang chờ phê duyệt',
        meta: 'Manifest đã publish',
        step: 'build',
      },
    });

    expect(screen.queryByRole('button', { name: 'Mở canvas' })).toBeNull();
    expect(screen.getByText('Build đang chờ phê duyệt')).toBeDefined();
    expect(screen.getByText('Manifest đã publish')).toBeDefined();
    const artifact = screen.getByRole('button', { name: 'Mở canvas: Definition v2' });
    const readingRails = [...document.querySelectorAll<HTMLElement>('[data-agent-reading-rail]')];

    // Cards, starter controls and the composer live on one shared rail. A
    // card may not quietly impose a narrower max-width and drift off-axis.
    expect(artifact.className).toContain('w-full');
    expect(artifact.className).not.toContain('max-w-');
    expect(readingRails).toHaveLength(4);
    expect(readingRails.every((rail) => rail.className.includes('max-w-[42rem]'))).toBe(true);

    fireEvent.click(artifact);
    expect(onOpenCanvas).toHaveBeenCalledWith('build');
  });

  it('opens Capabilities from the plus tool control in the composer', () => {
    const onOpenCapabilities = vi.fn();
    renderPanel({ onOpenCapabilities });

    expect(screen.queryByRole('button', { name: 'Capabilities' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mở Năng lực' }));
    expect(onOpenCapabilities).toHaveBeenCalledTimes(1);
  });

  it('keeps keyboard focus on the composer shell instead of outlining the textarea', () => {
    renderPanel();
    expect(screen.getByLabelText('Agent goal').className).toContain('chat-composer-input');
  });

  it('uses the shared vector mark in the empty agent welcome state', () => {
    renderPanel();

    expect(screen.getByText('Bắt đầu bằng một tình huống giao thông').previousElementSibling?.getAttribute('src'))
      .toBe('/brand/worker-avatar.png');
  });

  it('creates one durable thread on the first turn and appends on later turns', async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: 'Xe phanh gấp.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    await waitFor(() =>
      expect(apiClient.createAgentThread).toHaveBeenCalledWith('Xe phanh gấp.', expect.objectContaining({ projectId: session.projectId })),
    );
    await completeStream(0);

    const send = await screen.findByRole('button', { name: 'Gửi tin nhắn cho trợ lý' });
    fireEvent.change(screen.getByLabelText('Agent message'), { target: { value: 'Tiếp tục.' } });
    fireEvent.click(send);

    await waitFor(() =>
      expect(apiClient.appendAgentMessage).toHaveBeenCalledWith(thread.thread_id, 'Tiếp tục.', expect.objectContaining({ projectId: session.projectId })),
    );
  });

  it('restores transcript and replays events after a reload', async () => {
    vi.mocked(apiClient.getAgentThread).mockResolvedValue({ ...thread, title: 'Restored thread' });
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({
      items: [
        { message_id: 'msg-1', role: 'user' as const, safe_summary: 'Một xe cắt ngang.', created_at: '2026-08-26T00:01:00Z' },
      ],
      correlation_id: 'corr-transcript',
    } as never);

    renderPanel({ selectedThreadId: thread.thread_id });

    await waitFor(() => expect(apiClient.getAgentTranscript).toHaveBeenCalledWith(
      thread.thread_id,
      expect.objectContaining({ projectId: session.projectId }),
    ));
    // Replay reconnects from the very first durable cursor.
    await waitFor(() => expect(apiClient.streamAgentEvents).toHaveBeenCalledWith(
      thread.thread_id,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ afterCursor: 0 }),
    ));
    await waitFor(() => expect(screen.getByText('Một xe cắt ngang.')).toBeDefined());
  });

  it('submits a clarification choice as an answer decision', async () => {
    const pendingClarification = {
      interrupt_id: 'int-c1', thread_id: thread.thread_id, kind: 'clarification' as const,
      reason: 'clarification', allowed_decisions: ['answer'] as const,
      target_hash: 'c'.repeat(64), target_params_hash: 'd'.repeat(64),
      display_summary: 'Thời tiết của scenario là gì?', created_at: '2026-08-26T00:00:00Z',
      correlation_id: 'corr-panel',
      clarification: {
        field: 'weather',
        prompt: 'Thời tiết của scenario là gì?',
        choices: [
          { ordinal: 1, value: 'clear', label: 'Nắng' },
          { ordinal: 2, value: 'rain', label: 'Mưa' },
        ],
        allows_other: true,
      },
    };
    vi.mocked(apiClient.getPendingAgentInterrupt)
      .mockResolvedValueOnce(pendingClarification)
      .mockResolvedValue(pendingClarification);
    vi.mocked(apiClient.decideAgentInterrupt).mockResolvedValue({
      status: 'resolved', interrupt_id: pendingClarification.interrupt_id, message_id: null,
      resumed: true, correlation_id: 'corr-decide',
    });

    renderPanel();

    // Create the thread, then deliver one clarification interrupt over SSE.
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: 'Kịch bản thời tiết.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    await waitFor(() => expect(streamRef).not.toBeNull());
    await act(async () => {
      const callbacks = lastStreamCallbacks();
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingClarification.interrupt_id,
        kind: pendingClarification.kind,
        reason: pendingClarification.reason,
        allowed_decisions: pendingClarification.allowed_decisions,
        target_hash: pendingClarification.target_hash,
        target_params_hash: pendingClarification.target_params_hash,
      }));
    });

    await waitFor(() => expect(screen.getByText('Thời tiết của scenario là gì?')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Nắng/ }));

    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledWith(
      thread.thread_id,
      pendingClarification.interrupt_id,
      'answer',
      expect.objectContaining({ projectId: session.projectId }),
      '1',
    ));
  });

  it('rolls back the running turn and speaks operator-safe Vietnamese when thread creation fails (L2/L3)', async () => {
    const { ApiError } = await import('../../../src/shared/api/client');
    vi.mocked(apiClient.createAgentThread).mockRejectedValueOnce(
      new ApiError(404, {
        schema_version: '1.0.0',
        failure_class: 'INFRASTRUCTURE',
        // The transport fallback code a plain FastAPI 404 produces client-side.
        code: 'ERR_INVALID_ERROR_RESPONSE',
        message: 'The API returned an invalid error response.',
        retryable: false,
        correlation_id: 'corr-404',
      }),
    );

    renderPanel();

    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: 'Xin chào!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    // The turn must NOT stay "running": the composer returns to its idle
    // start-thread state instead of parking on a stop button forever.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' })).toBeDefined());
    expect(screen.queryByRole('button', { name: /Dừng lượt xử lý/ })).toBeNull();
    // The raw English transport copy must never reach the operator.
    const statusLine = screen.getByRole('status');
    expect(statusLine.textContent).not.toContain('The API returned');
    expect(statusLine.textContent).toContain('Máy chủ trả về phản hồi không hợp lệ');
  });

  it('parks a Capabilities intent into the composer exactly once', async () => {
    const onConsumed = vi.fn();
    renderPanel({ pendingIntent: 'Hãy tạo kịch bản về "xe cắt ngang"', onPendingIntentConsumed: onConsumed });

    await waitFor(() => expect((screen.getByLabelText('Agent goal') as HTMLTextAreaElement).value).toContain('xe cắt ngang'));
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it('renders one safe recovery action from a failed agent turn', async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: 'Ego chưa có vai trò.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    await waitFor(() => expect(streamRef).not.toBeNull());
    await act(async () => {
      const callbacks = lastStreamCallbacks();
      await callbacks.onEvent(event(1, 'verification', {
        status: 'FAILED',
        recovery: {
          message: 'Hãy chọn vai trò ego cho xe để tiếp tục.',
          field: 'role',
          subject: 'vehicle',
          action: 'clarify',
        },
      }));
      await callbacks.onEvent(event(2, 'failed', { status: 'FAILED' }));
    });

    expect(screen.getByText('Hãy chọn vai trò ego cho xe để tiếp tục.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Bổ sung thông tin' })).toBeDefined();
    expect(screen.queryByText('SEMANTIC_EGO_ROLE_UNRESOLVED')).toBeNull();
  });
});
