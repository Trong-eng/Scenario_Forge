import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgeWorkspace } from '../../../src/components/forge/ForgeWorkspace';
import { projectClarificationExchanges } from '../../../src/components/forge/clarificationExchange';
import { ApiError, apiClient, createProjectSession } from '../../../src/shared/api/client';
import type { AgentEphemeralFrame, AgentEvent, AgentThread } from '../../../src/shared/api/agentTypes';

vi.mock('../../../src/components/forge/clarificationExchange', async () => {
  const actual = await vi.importActual<typeof import('../../../src/components/forge/clarificationExchange')>(
    '../../../src/components/forge/clarificationExchange',
  );
  return { ...actual, projectClarificationExchanges: vi.fn(actual.projectClarificationExchanges) };
});

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>('../../../src/shared/api/client');
  return {
    ...actual,
    apiClient: Object.fromEntries(Object.keys(actual.apiClient).map((key) => [key, vi.fn()])),
    createProjectSession: vi.fn(),
  };
});

const thread: AgentThread = {
  thread_id: 'thread-1',
  project_id: 'project-a',
  status: 'active',
  title: 'Safe crossing thread',
  summary: 'Build a safe crossing scenario',
  turn_count: 1,
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
  correlation_id: 'corr-thread',
};

const event = (
  cursor: number,
  event_type: AgentEvent['event_type'],
  payload: Record<string, unknown>,
  stepId = `step-${cursor}`,
): AgentEvent => ({
  event_id: `event-${cursor}`,
  cursor,
  event_type,
  thread_id: thread.thread_id,
  step_id: stepId,
  correlation_id: 'corr-agent',
  payload,
  created_at: '2026-08-21T00:00:00Z',
});

const pendingApproval = {
  interrupt_id: 'interrupt-1', thread_id: thread.thread_id, kind: 'approval' as const,
  reason: 'approval', allowed_decisions: ['approve', 'reject'] as const,
  target_hash: 'a'.repeat(64), target_params_hash: 'b'.repeat(64),
  display_summary: 'Approve the exact Build?', created_at: '2026-08-21T00:00:00Z',
  correlation_id: 'corr-agent',
};

const pendingClarification = {
  interrupt_id: 'interrupt-c1', thread_id: thread.thread_id, kind: 'clarification' as const,
  reason: 'clarification', allowed_decisions: ['answer'] as const,
  target_hash: 'c'.repeat(64), target_params_hash: 'd'.repeat(64),
  display_summary: 'Cần biết thời tiết của scenario.', created_at: '2026-08-21T00:00:00Z',
  correlation_id: 'corr-agent',
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

describe('ForgeWorkspace agent-thread integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(createProjectSession).mockResolvedValue({
      project_id: 'project-a', project_token: 'project-token', permissions: [],
    });
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({ items: [], next_cursor: null, correlation_id: 'corr-list' });
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({ items: [], correlation_id: 'corr-transcript' });
    vi.mocked(apiClient.createProviderDefinition).mockResolvedValue({ definition: null, job_status: 'queued' } as never);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('uses one human-facing agent composer and hides operational event identifiers', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.appendAgentMessage).mockResolvedValue({ ...thread, turn_count: 2 });
    vi.mocked(apiClient.getPendingAgentInterrupt)
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValue(null);
    vi.mocked(apiClient.decideAgentInterrupt).mockResolvedValue({
      status: 'resolved', interrupt_id: pendingApproval.interrupt_id, message_id: null,
      resumed: true, correlation_id: 'corr-decision',
    });

    const streamSignals: AbortSignal[] = [];
    vi.mocked(apiClient.streamAgentEvents)
      .mockImplementationOnce(async (_threadId, _context, callbacks, options) => {
        const signal = options?.signal;
        if (!signal) throw new Error('expected stream abort signal');
        streamSignals.push(signal);
        await callbacks.onEvent(event(1, 'plan_created', {}));
        await callbacks.onEvent(event(2, 'tool_result', { status: 'clarification' }));
        await callbacks.onEvent(event(3, 'verification', {}));
        await callbacks.onEvent(event(4, 'interrupt_required', {
          interrupt_id: pendingApproval.interrupt_id, kind: pendingApproval.kind,
          reason: pendingApproval.reason, allowed_decisions: pendingApproval.allowed_decisions,
          target_hash: pendingApproval.target_hash, target_params_hash: pendingApproval.target_params_hash,
          display_summary: pendingApproval.display_summary,
        }));
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      })
      .mockImplementationOnce(async (_threadId, _context, callbacks, options) => {
        const signal = options?.signal;
        if (!signal) throw new Error('expected stream abort signal');
        streamSignals.push(signal);
        await callbacks.onEvent(event(5, 'tool_result', { status: 'success', definition_id: 'definition-ready' }));
        await callbacks.onEvent(event(6, 'completed', {}));
      });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    await screen.findByLabelText('Agent goal');
    expect(document.querySelectorAll('[data-agent-reading-rail]').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByLabelText('Scenario request')).toBeNull();

    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    expect(await screen.findByText('Cần thêm thông tin để tiếp tục')).toBeDefined();
    expect(screen.queryByText('Đã hiểu yêu cầu')).toBeNull();
    expect(screen.queryByText('Cần làm rõ yêu cầu')).toBeNull();
    expect(screen.queryByText('Đang kiểm tra kết quả')).toBeNull();
    expect(screen.queryByText('Cần bạn xác nhận')).toBeNull();
    const pendingRegion = screen.getByRole('region', { name: 'Pending agent interrupt' });
    expect(pendingRegion).toBeDefined();
    expect(screen.getByText('Đang chờ phản hồi')).toBeDefined();
    expect(screen.queryByText('Đang cập nhật')).toBeNull();
    expect(await within(pendingRegion).findByText('Bản dựng cần được bạn phê duyệt trước khi tiếp tục.')).toBeDefined();
    expect(document.body.textContent).not.toContain(pendingApproval.display_summary);
    const approveButton = within(pendingRegion).getByRole('button', { name: 'Phê duyệt' });
    expect(approveButton).toBeDefined();
    expect(within(pendingRegion).getByRole('button', { name: 'Từ chối' })).toBeDefined();
    expect(document.body.textContent).not.toContain('decision_token');
    expect(document.body.textContent).not.toContain('private-capability');
    expect(document.body.textContent).not.toContain('cursor 1');
    expect(document.body.textContent).not.toContain('correlation corr-agent');
    expect(apiClient.createAgentThread).toHaveBeenCalledWith(thread.summary, expect.objectContaining({
      projectId: 'project-a',
      projectToken: 'project-token',
      idempotencyKey: expect.any(String),
    }));
    expect(String(vi.mocked(apiClient.getPendingAgentInterrupt).mock.calls[0]?.[1].correlationId).length).toBeLessThanOrEqual(64);
    expect(apiClient.createProviderDefinition).not.toHaveBeenCalled();

    fireEvent.click(approveButton);
    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledWith(
      thread.thread_id,
      pendingApproval.interrupt_id,
      'approve',
      expect.objectContaining({ projectId: 'project-a', projectToken: 'project-token' }),
      undefined,
    ));
    expect(screen.queryByRole('region', { name: 'Pending agent interrupt' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Agent message'), { target: { value: 'Add a pedestrian' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn cho trợ lý' }));
    await waitFor(() => expect(apiClient.appendAgentMessage).toHaveBeenCalledWith(
      thread.thread_id,
      'Add a pedestrian',
      expect.objectContaining({ projectId: 'project-a', projectToken: 'project-token' }),
    ));
    await waitFor(() => expect(apiClient.streamAgentEvents).toHaveBeenCalledTimes(2));
    expect(streamSignals[0]?.aborted).toBe(true);
    expect(vi.mocked(apiClient.streamAgentEvents).mock.calls[1]?.[3]).toEqual(expect.objectContaining({ afterCursor: 4 }));
    expect((await screen.findByRole('article', { name: 'Agent response' })).textContent).toContain('Agent đã hoàn tất lượt xử lý này.');
    expect(screen.queryByRole('button', { name: 'Neo và dựng Scenic' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pending agent interrupt' })).toBeNull();
    expect(apiClient.decideAgentInterrupt).toHaveBeenCalledTimes(1);
  });

  it('renders safe interrupt resolution, resume, and final evidence without capability text', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockImplementationOnce(async (_threadId, _context, callbacks) => {
      await callbacks.onEvent(event(1, 'interrupt_resolved', { interrupt_id: 'interrupt-1', decision: 'approve', message_id: null }));
      await callbacks.onEvent(event(2, 'resumed', { interrupt_id: 'interrupt-1', status: 'accepted' }));
      await callbacks.onEvent(event(3, 'completed', { evidence_refs: ['artifact:safe-report'] }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    const toggle = await screen.findByRole('button', { name: /đã xử lý/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.queryByText('Đã ghi nhận quyết định')).toBeNull();
    expect(screen.queryByText('Đang tiếp tục xử lý')).toBeNull();
    expect(screen.getByRole('article', { name: 'Agent response' }).textContent).toContain('Agent đã hoàn tất');
    expect(screen.queryByText('artifact:safe-report')).toBeNull();
    expect(document.body.textContent).not.toContain('token');
  });

  it('connects a created thread cursor stream and aborts it on cleanup', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    let streamSignal: AbortSignal | undefined;
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, _callbacks, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      streamSignal = signal;
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    const view = render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    await waitFor(() => expect(apiClient.streamAgentEvents).toHaveBeenCalledWith(
      thread.thread_id,
      expect.objectContaining({ projectId: 'project-a', projectToken: 'project-token' }),
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal), afterCursor: 0 }),
    ));
    expect(screen.getByText('Đang bắt đầu…')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Nhật ký xử lý' })).toBeNull();
    expect(apiClient.createAgentThread).toHaveBeenCalledOnce();

    view.unmount();
    expect(streamSignal?.aborted).toBe(true);
  });

  it('does not rescan durable clarification history for an ephemeral token batch', async () => {
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(performance.now());
      return 1;
    });
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    let streamCallbacks: Parameters<typeof apiClient.streamAgentEvents>[2] | undefined;
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      streamCallbacks = callbacks;
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    await waitFor(() => expect(streamCallbacks).toBeDefined());

    const scansBeforeDelta = vi.mocked(projectClarificationExchanges).mock.calls.length;
    const frame: AgentEphemeralFrame = {
      event_id: 'transient-reasoning-1',
      event_type: 'reasoning_summary_delta',
      thread_id: thread.thread_id,
      step_id: null,
      correlation_id: 'corr-agent',
      payload: {
        segment_id: 'seg-analysis', stage: 'analysis', sequence: 1,
        delta: 'Đang đối chiếu dữ kiện scenario.',
      },
      created_at: '2026-08-21T00:00:01Z',
      ephemeral: true,
    };
    await act(async () => { streamCallbacks?.onEphemeral?.(frame); });
    await screen.findByText('Đang đối chiếu dữ kiện scenario.');

    expect(projectClarificationExchanges).toHaveBeenCalledTimes(scansBeforeDelta);
    animationFrame.mockRestore();
  });

  it('retries retryable projection-incomplete, refreshes the server, and keeps the composer disabled', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt)
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValue(null);
    const incomplete = new ApiError(409, {
      schema_version: '1.0.0',
      failure_class: 'INFRASTRUCTURE',
      code: 'AGENT_DECISION_PROJECTION_INCOMPLETE',
      message: 'The accepted decision was finalized but deferred projection is incomplete.',
      retryable: true,
      correlation_id: 'corr-projection',
    });
    let releaseFirst: ((result: 'fail' | 'ok') => void) | undefined;
    const firstGate = new Promise<'fail' | 'ok'>((resolve) => {
      releaseFirst = resolve;
    });
    vi.mocked(apiClient.decideAgentInterrupt)
      .mockImplementationOnce(async () => {
        const result = await firstGate;
        if (result === 'fail') throw incomplete;
        return {
          status: 'resolved', interrupt_id: pendingApproval.interrupt_id, message_id: null,
          resumed: true, correlation_id: 'corr-decision',
        };
      })
      .mockResolvedValueOnce({
        status: 'resolved', interrupt_id: pendingApproval.interrupt_id, message_id: null,
        resumed: true, correlation_id: 'corr-decision-retry',
      });
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingApproval.interrupt_id, kind: pendingApproval.kind,
        reason: pendingApproval.reason, allowed_decisions: pendingApproval.allowed_decisions,
        target_hash: pendingApproval.target_hash, target_params_hash: pendingApproval.target_params_hash,
        display_summary: pendingApproval.display_summary,
      }));
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    await screen.findByRole('button', { name: 'Phê duyệt' });

    fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }));
    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText('Agent message') as HTMLTextAreaElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain(pendingApproval.interrupt_id);
    expect(document.body.textContent).not.toContain('thinking');
    expect(document.body.textContent).not.toContain('private-capability');
    expect(document.body.textContent).not.toContain('sk-');

    releaseFirst?.('fail');
    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Pending agent interrupt' })).toBeNull());
    expect((screen.getByLabelText('Agent message') as HTMLTextAreaElement).disabled).toBe(false);
    expect(vi.mocked(apiClient.getPendingAgentInterrupt).mock.calls.length).toBeGreaterThan(2);
  });

  it('offers an explicit retry after bounded projection recovery failures without leaking identifiers', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(pendingApproval);
    const incomplete = new ApiError(409, {
      schema_version: '1.0.0',
      failure_class: 'INFRASTRUCTURE',
      code: 'AGENT_DECISION_PROJECTION_INCOMPLETE',
      message: 'The accepted decision was finalized but deferred projection is incomplete.',
      retryable: true,
      correlation_id: 'corr-projection',
    });
    vi.mocked(apiClient.decideAgentInterrupt).mockRejectedValue(incomplete);
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingApproval.interrupt_id, kind: pendingApproval.kind,
        reason: pendingApproval.reason, allowed_decisions: pendingApproval.allowed_decisions,
        target_hash: pendingApproval.target_hash, target_params_hash: pendingApproval.target_params_hash,
        display_summary: pendingApproval.display_summary,
      }));
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    await screen.findByRole('button', { name: 'Phê duyệt' });
    fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }));

    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeDefined();
    expect(await screen.findByText('The accepted decision was finalized but deferred projection is incomplete.')).toBeDefined();
    expect((screen.getByLabelText('Agent message') as HTMLTextAreaElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain(pendingApproval.interrupt_id);
    expect(document.body.textContent).not.toContain('corr-projection');
    expect(document.body.textContent).not.toContain('thinking');
    expect(vi.mocked(apiClient.decideAgentInterrupt).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(vi.mocked(apiClient.decideAgentInterrupt).mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('does not show a transport error while a clarification decision is still reconciling', async () => {
    const nextPending = {
      ...pendingClarification,
      interrupt_id: 'interrupt-c2',
      display_summary: 'Cần biết khoảng cách.',
      clarification: {
        field: 'gap',
        prompt: 'Khoảng cách là bao nhiêu?',
        choices: [{ ordinal: 1, value: '8 m', label: '8 m' }],
        allows_other: true,
      },
    };
    const transportCopy = 'Không thể gửi yêu cầu tới agent. Vui lòng thử lại.';
    let streamCallbacks: Parameters<typeof apiClient.streamAgentEvents>[2] | undefined;
    let failDecide: ((error: Error) => void) | undefined;
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(pendingClarification);
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      streamCallbacks = callbacks;
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingClarification.interrupt_id,
        kind: pendingClarification.kind,
        reason: pendingClarification.reason,
        allowed_decisions: pendingClarification.allowed_decisions,
        target_hash: pendingClarification.target_hash,
        target_params_hash: pendingClarification.target_params_hash,
        display_summary: pendingClarification.display_summary,
        clarification: pendingClarification.clarification,
      }));
      const signal = options?.signal;
      if (signal) await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    vi.mocked(apiClient.decideAgentInterrupt).mockImplementation(() => new Promise((_, reject) => {
      failDecide = reject;
    }));

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nắng' }));
    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledTimes(1));

    await act(async () => {
      streamCallbacks?.onError?.(new TypeError('Failed to fetch'));
    });
    await waitFor(() => {
      expect(screen.queryByText(transportCopy)).toBeNull();
      expect(screen.getByText('Đang khôi phục')).toBeDefined();
    });

    await act(async () => {
      failDecide?.(new TypeError('browser transport timed out while DeepSeek was still running'));
    });
    await waitFor(() => {
      expect(screen.getByText('Đang khôi phục')).toBeDefined();
      expect(screen.queryByText(transportCopy)).toBeNull();
    });

    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(nextPending);
    await act(async () => {
      await streamCallbacks?.onEvent(event(2, 'interrupt_resolved', {
        interrupt_id: pendingClarification.interrupt_id,
        decision: 'answer',
        message_id: 'message-2',
      }));
      await streamCallbacks?.onEvent(event(3, 'resumed', {
        interrupt_id: pendingClarification.interrupt_id,
        status: 'accepted',
      }));
      await streamCallbacks?.onEvent(event(4, 'interrupt_required', {
        interrupt_id: nextPending.interrupt_id,
        kind: nextPending.kind,
        reason: nextPending.reason,
        allowed_decisions: nextPending.allowed_decisions,
        target_hash: nextPending.target_hash,
        target_params_hash: nextPending.target_params_hash,
        display_summary: nextPending.display_summary,
        clarification: nextPending.clarification,
      }));
    });

    expect(await screen.findByRole('button', { name: '8 m' })).toBeDefined();
    expect(screen.queryByText(transportCopy)).toBeNull();
  });

  it('clears a stale decision transport error after durable delivery advances to a new interrupt', async () => {
    const nextPending = {
      ...pendingClarification,
      interrupt_id: 'interrupt-c2',
      display_summary: 'Cần biết khoảng cách.',
      clarification: {
        field: 'gap',
        prompt: 'Khoảng cách là bao nhiêu?',
        choices: [{ ordinal: 1, value: '8 m', label: '8 m' }],
        allows_other: true,
      },
    };
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(pendingClarification);
    let streamCallbacks: Parameters<typeof apiClient.streamAgentEvents>[2] | undefined;
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      streamCallbacks = callbacks;
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingClarification.interrupt_id,
        kind: pendingClarification.kind,
        reason: pendingClarification.reason,
        allowed_decisions: pendingClarification.allowed_decisions,
        target_hash: pendingClarification.target_hash,
        target_params_hash: pendingClarification.target_params_hash,
        display_summary: pendingClarification.display_summary,
        clarification: pendingClarification.clarification,
      }));
      const signal = options?.signal;
      if (signal) await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    vi.mocked(apiClient.decideAgentInterrupt).mockImplementation(async () => {
      vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(nextPending);
      await streamCallbacks?.onEvent(event(2, 'interrupt_resolved', {
        interrupt_id: pendingClarification.interrupt_id,
        decision: 'answer',
        message_id: 'message-2',
      }));
      await streamCallbacks?.onEvent(event(3, 'resumed', {
        interrupt_id: pendingClarification.interrupt_id,
        status: 'accepted',
      }));
      await streamCallbacks?.onEvent(event(4, 'interrupt_required', {
        interrupt_id: nextPending.interrupt_id,
        kind: nextPending.kind,
        reason: nextPending.reason,
        allowed_decisions: nextPending.allowed_decisions,
        target_hash: nextPending.target_hash,
        target_params_hash: nextPending.target_params_hash,
        display_summary: nextPending.display_summary,
        clarification: nextPending.clarification,
      }));
      throw new TypeError('browser transport timed out after durable acceptance');
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nắng' }));

    expect(await screen.findByRole('button', { name: '8 m' })).toBeDefined();
    await waitFor(() => expect(screen.queryByText('Không thể gửi yêu cầu tới agent. Vui lòng thử lại.')).toBeNull());
  });

  it('keeps a fail-closed envelope when a clarification decision is rejected', async () => {
    const rejected = new ApiError(409, {
      schema_version: '1.0.0',
      failure_class: 'INPUT_OR_CONTRACT',
      code: 'AGENT_INTERRUPT_DECISION_NOT_ALLOWED',
      message: 'The decision is not allowed for the persisted interrupt kind.',
      retryable: false,
      correlation_id: 'corr-reject',
    });
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(pendingClarification);
    vi.mocked(apiClient.decideAgentInterrupt).mockRejectedValue(rejected);
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingClarification.interrupt_id,
        kind: pendingClarification.kind,
        reason: pendingClarification.reason,
        allowed_decisions: pendingClarification.allowed_decisions,
        target_hash: pendingClarification.target_hash,
        target_params_hash: pendingClarification.target_params_hash,
        display_summary: pendingClarification.display_summary,
        clarification: pendingClarification.clarification,
      }));
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nắng' }));

    expect(await screen.findByText('The decision is not allowed for the persisted interrupt kind.')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Pending agent interrupt' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Nắng' })).toBeDefined();
    expect(document.body.textContent).not.toContain(pendingClarification.interrupt_id);
    expect(document.body.textContent).not.toContain('corr-reject');
  });

  it('shows a view-only user bubble immediately when a scenario message is sent', async () => {
    let releaseThread: ((value: AgentThread) => void) | undefined;
    vi.mocked(apiClient.createAgentThread).mockImplementation(() => new Promise((resolve) => {
      releaseThread = resolve;
    }));
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, _callbacks, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    const bubble = await screen.findByRole('article', { name: 'User message' });
    expect(bubble.textContent).toContain(thread.summary);
    expect(bubble.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
    expect(apiClient.createAgentThread).toHaveBeenCalledOnce();
    expect(apiClient.streamAgentEvents).not.toHaveBeenCalled();

    releaseThread?.(thread);
    await waitFor(() => expect(apiClient.streamAgentEvents).toHaveBeenCalledOnce());
    expect(screen.getAllByRole('article', { name: 'User message' })).toHaveLength(1);
  });

  it('renders one numbered clarification with Other and submits the decide endpoint', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(pendingClarification);
    vi.mocked(apiClient.decideAgentInterrupt).mockResolvedValue({
      status: 'resolved', interrupt_id: pendingClarification.interrupt_id, message_id: 'msg-answer',
      resumed: true, correlation_id: 'corr-decision',
    });
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingClarification.interrupt_id,
        kind: pendingClarification.kind,
        reason: pendingClarification.reason,
        allowed_decisions: pendingClarification.allowed_decisions,
        target_hash: pendingClarification.target_hash,
        target_params_hash: pendingClarification.target_params_hash,
        display_summary: pendingClarification.display_summary,
        clarification: pendingClarification.clarification,
      }));
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    expect(await screen.findByText('Thời tiết của scenario là gì?')).toBeDefined();
    const chooser = screen.getByRole('region', { name: 'Pending agent interrupt' });
    expect(screen.getAllByRole('region', { name: 'Pending agent interrupt' })).toHaveLength(1);
    expect(chooser.closest('[data-agent-conversation-list="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Nắng' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mưa' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Khác…' })).toBeDefined();
    expect((screen.getByLabelText('Agent message') as HTMLTextAreaElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain(pendingClarification.interrupt_id);
    expect(document.body.textContent).not.toContain(pendingClarification.target_hash);

    fireEvent.click(screen.getByRole('button', { name: 'Nắng' }));
    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledWith(
      thread.thread_id,
      pendingClarification.interrupt_id,
      'answer',
      expect.objectContaining({ projectId: 'project-a', projectToken: 'project-token' }),
      '1',
    ));
    const inlineAnswer = await screen.findByRole('article', { name: 'Agent clarification answer' });
    expect(inlineAnswer.textContent).toContain('Đã thêm');
    expect(inlineAnswer.textContent).toContain('Thời tiết');
    expect(inlineAnswer.textContent).toContain('Nắng');
    expect(screen.getAllByRole('article', { name: 'User message' })).toHaveLength(1);
  });

  it('localizes raw provider clarification copy without changing durable choices', async () => {
    const englishMapClarification = {
      ...pendingClarification,
      display_summary: 'Clarify `map`: Please clarify the map detail. Reply with a choice number.',
      clarification: {
        field: 'map',
        prompt: "Please clarify the 'map' detail.",
        choices: [{ ordinal: 1, value: 'Town05', label: 'Town05' }],
        allows_other: true,
      },
    };
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(englishMapClarification);
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: englishMapClarification.interrupt_id,
        kind: englishMapClarification.kind,
        reason: englishMapClarification.reason,
        allowed_decisions: englishMapClarification.allowed_decisions,
        target_hash: englishMapClarification.target_hash,
        target_params_hash: englishMapClarification.target_params_hash,
        display_summary: englishMapClarification.display_summary,
        clarification: englishMapClarification.clarification,
      }));
      const signal = options?.signal;
      if (signal) await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    expect(await screen.findByText('Bạn muốn dùng bản đồ CARLA nào?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Town05' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Khác…' })).toBeDefined();
    expect(document.body.textContent).not.toContain('Please clarify');
    expect(document.body.textContent).not.toContain('Reply with');
  });

  it('localizes an English duration clarification when the provider supplies no choices', async () => {
    const durationClarification = {
      ...pendingClarification,
      display_summary: 'Enter the exact duration with ms, s, min, or h.',
      clarification: {
        field: 'duration',
        prompt: 'Enter the exact duration with ms, s, min, or h.',
        choices: [],
        allows_other: true,
      },
    };
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt)
      .mockResolvedValueOnce(durationClarification)
      .mockResolvedValueOnce(durationClarification)
      .mockResolvedValueOnce(null);
    vi.mocked(apiClient.decideAgentInterrupt).mockResolvedValue({
      status: 'resolved', interrupt_id: durationClarification.interrupt_id, message_id: 'msg-duration',
      resumed: true, correlation_id: 'corr-duration',
    });
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: durationClarification.interrupt_id,
        kind: durationClarification.kind,
        reason: durationClarification.reason,
        allowed_decisions: durationClarification.allowed_decisions,
        target_hash: durationClarification.target_hash,
        target_params_hash: durationClarification.target_params_hash,
        display_summary: durationClarification.display_summary,
        clarification: durationClarification.clarification,
      }));
      const signal = options?.signal;
      if (signal) await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    expect(await screen.findByText('Bạn muốn mô phỏng trong bao lâu? (ví dụ: 5 s, 500 ms).')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Khác…' })).toBeDefined();
    expect(document.body.textContent).not.toContain('Enter the exact duration');

    fireEvent.click(screen.getByRole('button', { name: 'Khác…' }));
    fireEvent.change(screen.getByLabelText('Clarification answer'), { target: { value: '5 s' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trả lời' }));
    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledWith(
      thread.thread_id,
      durationClarification.interrupt_id,
      'answer',
      expect.objectContaining({ projectId: 'project-a', projectToken: 'project-token' }),
      '5 s',
    ));
    const inlineAnswer = await screen.findByRole('article', { name: 'Agent clarification answer' });
    expect(inlineAnswer.textContent).toContain('Thời lượng');
    expect(inlineAnswer.textContent).not.toContain('duration');
  });

  it('projects durable Vietnamese progress including repair, retry, and loop without leaking internals', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockImplementationOnce(async (_threadId, _context, callbacks) => {
      await callbacks.onEvent(event(1, 'plan_created', { plan_id: 'plan-secret', step_ids: ['step-hidden'] }));
      await callbacks.onEvent(event(2, 'repair_attempt', { attempt: 1, reason_codes: ['MISSING_GROUND'] }, 'author'));
      await callbacks.onEvent(event(3, 'retry_attempt', { attempt: 2, loop_state: 'retrying' }, 'author'));
      await callbacks.onEvent(event(4, 'tool_result', {
        status: 'success',
        tool_name: 'author_definition',
        definition_id: 'definition-1',
        thinking: 'I will secretly rewrite the plan',
        safe_summary: 'Đã xuất bản definition an toàn.',
      }, 'author'));
      await callbacks.onEvent(event(5, 'completed', { status: 'COMPLETED' }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    const toggle = await screen.findByRole('button', { name: /đã xử lý/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Nhật ký xử lý' })).toBeDefined();
    expect(screen.queryByText('Đã hiểu yêu cầu')).toBeNull();
    expect(screen.getByText('Đã hiệu chỉnh cách hiểu 2 lần')).toBeDefined();
    expect(screen.queryByText('Đã thử lại')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Đã dựng Definition' }));
    expect(screen.getByText('Đã xuất bản definition an toàn.')).toBeDefined();
    expect(document.body.textContent).not.toContain('plan-secret');
    expect(document.body.textContent).not.toContain('step-hidden');
    expect(document.body.textContent).not.toContain('author_definition');
    expect(document.body.textContent).not.toContain('author_definition:v1');
    expect(document.body.textContent).not.toContain('MISSING_GROUND');
    expect(document.body.textContent).not.toContain('I will secretly rewrite the plan');
    expect(document.body.textContent).not.toContain('thinking');
  });

  it('submits Other free text through the decide endpoint as a view-only answer', async () => {
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt)
      .mockResolvedValueOnce(pendingClarification)
      .mockResolvedValueOnce(pendingClarification)
      .mockResolvedValue(null);
    vi.mocked(apiClient.decideAgentInterrupt).mockResolvedValue({
      status: 'resolved', interrupt_id: pendingClarification.interrupt_id, message_id: 'msg-other',
      resumed: true, correlation_id: 'corr-decision',
    });
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('expected stream abort signal');
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingClarification.interrupt_id,
        kind: pendingClarification.kind,
        reason: pendingClarification.reason,
        allowed_decisions: pendingClarification.allowed_decisions,
        target_hash: pendingClarification.target_hash,
        target_params_hash: pendingClarification.target_params_hash,
        display_summary: pendingClarification.display_summary,
        clarification: pendingClarification.clarification,
      }));
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));
    await screen.findByRole('button', { name: 'Khác…' });
    fireEvent.click(screen.getByRole('button', { name: 'Khác…' }));
    fireEvent.change(screen.getByLabelText('Clarification answer'), { target: { value: 'Sương mù nhẹ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trả lời' }));

    await waitFor(() => expect(apiClient.decideAgentInterrupt).toHaveBeenCalledWith(
      thread.thread_id,
      pendingClarification.interrupt_id,
      'answer',
      expect.objectContaining({ projectId: 'project-a' }),
      'Sương mù nhẹ',
    ));
    const inlineAnswer = screen.getByRole('article', { name: 'Agent clarification answer' });
    expect(inlineAnswer.textContent).toContain('Đã thêm');
    expect(inlineAnswer.textContent).toContain('Thời tiết');
    expect(inlineAnswer.textContent).toContain('Sương mù nhẹ');
    expect(screen.getAllByRole('article', { name: 'User message' })).toHaveLength(1);
  });

  it('hydrates Recent exclusively from durable agent threads and ignores a localStorage ghost', async () => {
    const durable = { ...thread, title: 'Durable crossing', updated_at: '2026-08-22T09:30:00Z' };
    window.localStorage.setItem('scenario-forge:agent-thread:project-a', 'ghost-thread');
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [durable], next_cursor: null, correlation_id: 'corr-list',
    });

    render(<ForgeWorkspace />);

    expect(await screen.findByText('Durable crossing')).toBeDefined();
    expect(screen.queryByText('Legacy authoring fixture')).toBeNull();
    expect(apiClient.getAgentThread).not.toHaveBeenCalledWith(
      'ghost-thread',
      expect.anything(),
    );
  });

  it('selects a Recent thread and restores its safe transcript and event replay from cursor zero', async () => {
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [thread], next_cursor: null, correlation_id: 'corr-list',
    });
    vi.mocked(apiClient.getAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({
      items: [{
        message_id: 'message-1', role: 'user', safe_summary: 'Pedestrian crosses at dusk.',
        created_at: '2026-08-21T00:00:00Z',
      }],
      correlation_id: 'corr-transcript',
    });
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(pendingClarification);
    vi.mocked(apiClient.streamAgentEvents).mockImplementationOnce(async (_threadId, _context, callbacks) => {
      await callbacks.onEvent(event(1, 'plan_created', {}));
    });

    render(<ForgeWorkspace />);
    const recentTitle = await screen.findByText('Safe crossing thread');
    fireEvent.click(recentTitle.closest('button')!);

    expect(await screen.findByText('Pedestrian crosses at dusk.')).toBeDefined();
    expect(await screen.findByText('Thời tiết của scenario là gì?')).toBeDefined();
    expect(apiClient.getAgentTranscript).toHaveBeenCalledWith(
      thread.thread_id,
      expect.objectContaining({ projectId: 'project-a' }),
    );
    expect(apiClient.streamAgentEvents).toHaveBeenCalledWith(
      thread.thread_id,
      expect.objectContaining({ projectId: 'project-a' }),
      expect.any(Object),
      expect.objectContaining({ afterCursor: 0 }),
    );
  });

  it('restores a clarification answer under its agent question instead of as a user bubble', async () => {
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [thread], next_cursor: null, correlation_id: 'corr-list',
    });
    vi.mocked(apiClient.getAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({
      items: [
        {
          message_id: 'message-request', role: 'user', safe_summary: thread.summary,
          created_at: '2026-08-21T00:00:00Z',
        },
        {
          message_id: 'message-answer', role: 'user', safe_summary: 'weather: clear',
          created_at: '2026-08-21T00:00:02Z',
        },
      ],
      correlation_id: 'corr-transcript',
    });
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockImplementationOnce(async (_threadId, _context, callbacks) => {
      await callbacks.onEvent(event(1, 'interrupt_required', {
        interrupt_id: pendingClarification.interrupt_id,
        kind: pendingClarification.kind,
        clarification: pendingClarification.clarification,
      }));
      await callbacks.onEvent(event(2, 'interrupt_resolved', {
        interrupt_id: pendingClarification.interrupt_id,
        decision: 'answer',
        message_id: 'message-answer',
      }));
      await callbacks.onEvent(event(3, 'assistant_text_delta', {
        message_id: 'assistant-final', sequence: 1, delta: 'Đã cập nhật bản nháp scenario.',
      }));
      await callbacks.onEvent(event(4, 'completed', { status: 'COMPLETED' }));
    });

    render(<ForgeWorkspace />);
    const recentTitle = await screen.findByText('Safe crossing thread');
    fireEvent.click(recentTitle.closest('button')!);

    const inlineAnswer = await screen.findByRole('article', { name: 'Agent clarification answer' });
    expect(inlineAnswer.textContent).toContain('Thời tiết');
    expect(inlineAnswer.textContent).toContain('Nắng');
    const responseStack = inlineAnswer.closest('[data-agent-response-stack="true"]');
    expect(responseStack).not.toBeNull();
    expect(responseStack?.className).toContain('gap-2');
    expect(responseStack?.querySelector('[data-agent-activity-stream="true"]')).not.toBeNull();
    const connector = inlineAnswer.querySelector('[data-clarification-connector="true"]');
    expect(connector).not.toBeNull();
    expect(connector?.className).toContain('agent-text-secondary');
    expect(screen.getByText('Đã thêm:').className).toContain('agent-text-primary');
    expect(screen.getAllByRole('article', { name: 'User message' })).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'User message' }).textContent).toContain(thread.summary);
    const response = await screen.findByRole('article', { name: 'Agent response' });
    expect(Boolean(inlineAnswer.compareDocumentPosition(response) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    await waitFor(() => expect(screen.getAllByText('Hoàn tất').length).toBeGreaterThan(0));
  });

  it('renames a durable Recent thread without changing its immutable summary', async () => {
    const renamed = { ...thread, title: 'Crossing review' };
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [thread], next_cursor: null, correlation_id: 'corr-list',
    });
    vi.mocked(apiClient.getAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockResolvedValue(undefined);
    vi.mocked(apiClient.renameAgentThread).mockResolvedValue(renamed);

    const view = render(<ForgeWorkspace />);
    const recentTitle = await screen.findByText(thread.title);
    fireEvent.click(recentTitle.closest('button')!);
    await waitFor(() => expect(screen.getAllByText(thread.title)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: `Đổi tên ${thread.title}` }));
    fireEvent.change(screen.getByLabelText('Tên cuộc trò chuyện'), { target: { value: renamed.title } });
    fireEvent.keyDown(screen.getByLabelText('Tên cuộc trò chuyện'), { key: 'Enter' });

    await waitFor(() => expect(screen.getAllByText(renamed.title)).toHaveLength(2));
    expect(screen.queryByText(thread.title)).toBeNull();
    expect(apiClient.renameAgentThread).toHaveBeenCalledWith(
      thread.thread_id,
      renamed.title,
      expect.objectContaining({ projectId: 'project-a' }),
    );
    expect(renamed.summary).toBe(thread.summary);

    view.unmount();
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [renamed], next_cursor: null, correlation_id: 'corr-list-remount',
    });
    render(<ForgeWorkspace />);
    expect(await screen.findByText(renamed.title)).toBeDefined();
    expect(screen.queryByText(thread.title)).toBeNull();
  });

  it('keeps a newly created scenario distinct and moves it to the top of Recent', async () => {
    const second = {
      ...thread,
      thread_id: 'thread-2',
      title: 'Rain merge scenario',
      summary: 'A motorcycle merges in rain.',
      updated_at: '2026-08-22T10:00:00Z',
    };
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [thread], next_cursor: null, correlation_id: 'corr-list',
    });
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(second);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockResolvedValue(undefined);

    render(<ForgeWorkspace />);
    await screen.findByText(thread.title);
    fireEvent.click(screen.getByRole('button', { name: 'Kịch bản mới' }));
    fireEvent.change(await screen.findByLabelText('Agent goal'), { target: { value: second.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    expect((await screen.findAllByText(second.title)).length).toBeGreaterThan(0);
    expect(screen.getByText(thread.title)).toBeDefined();
    expect(apiClient.createAgentThread).toHaveBeenCalledWith(
      second.summary,
      expect.objectContaining({ projectId: 'project-a', idempotencyKey: expect.any(String) }),
    );
  });

  it('retries as a new turn in the same thread, the way asking again would', async () => {
    // Homeowner feedback 2026-08-23: "Thử lại" opened a FRESH thread and wiped
    // the conversation. Fixed by re-asking in place — but that fix also
    // suppressed the second question bubble, meaning to replace the previous
    // answer the way ChatGPT replaces a regenerated one.
    //
    // Homeowner feedback 2026-08-31: nothing was replaced. The ledger is
    // append-only, so the retried answer landed under the original question
    // beside the first one, and a few retries read as one question with a pile
    // of answers stuck to it. A retry now does exactly what typing the question
    // again does: same thread, new turn, its own bubble and its own answer.
    vi.mocked(apiClient.createAgentThread).mockResolvedValue(thread);
    vi.mocked(apiClient.appendAgentMessage).mockResolvedValue(thread);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents)
      .mockImplementationOnce(async (_threadId, _context, callbacks) => {
        await callbacks.onEvent(event(1, 'assistant_text_delta', {
          message_id: 'answer-1', sequence: 1, delta: 'Câu trả lời đầu tiên.',
        }));
        await callbacks.onEvent(event(2, 'completed', {}));
      })
      .mockResolvedValueOnce(undefined);

    render(<ForgeWorkspace />);
    await screen.findByLabelText('Agent goal');
    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: thread.summary } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    await screen.findByText('Câu trả lời đầu tiên.');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại yêu cầu' }));

    // Same thread: the conversation is not reset and no second thread opens.
    await waitFor(() => expect(apiClient.appendAgentMessage).toHaveBeenCalledTimes(1));
    expect(apiClient.createAgentThread).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiClient.appendAgentMessage).mock.calls[0]?.[1]).toBe(thread.summary);
    // New turn: the question is asked again, so it appears again and the fresh
    // answer belongs to it instead of accumulating under the first one.
    await waitFor(() => expect(screen.getAllByRole('article', { name: 'User message' })).toHaveLength(2));
    for (const bubble of screen.getAllByRole('article', { name: 'User message' })) {
      expect(bubble.textContent).toContain(thread.summary);
    }
  });
});
