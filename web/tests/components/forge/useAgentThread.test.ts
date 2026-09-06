import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type ProviderRequestContext } from '../../../src/shared/api/client';
import { initialAgentThreadState, reduceAgentThread, type AgentEvent, type AgentPendingInterrupt } from '../../../src/shared/api/agentTypes';
import { useAgentThread } from '../../../src/components/forge/useAgentThread';

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>('../../../src/shared/api/client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getPendingAgentInterrupt: vi.fn(),
      streamAgentEvents: vi.fn(),
    },
  };
});

const event = (cursor: number, event_type: AgentEvent['event_type'], payload: Record<string, unknown> = {}): AgentEvent => ({ event_id: `e-${cursor}`, cursor, event_type, thread_id: 'thread-1', step_id: 'step-1', correlation_id: 'corr-1', payload, created_at: '2026-08-21T00:00:00Z' });

describe('agent event view reducer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockResolvedValue(undefined);
  });

  it('keeps ordered replay events and rejects at-least-once duplicates', () => {
    const current = reduceAgentThread(initialAgentThreadState, event(1, 'plan_created'));
    expect(reduceAgentThread(current, event(1, 'plan_created'))).toBe(current);
  });

  it('keeps controls disabled until the typed pending view is loaded and clears it on resolution', () => {
    const interrupted = reduceAgentThread(initialAgentThreadState, event(1, 'interrupt_required'));
    expect(interrupted.pendingInterrupt).toBeNull();
    const pending: AgentPendingInterrupt = {
      interrupt_id: 'interrupt-1', thread_id: 'thread-1', kind: 'approval', reason: 'approval',
      allowed_decisions: ['approve', 'reject'], target_hash: 'a'.repeat(64),
      target_params_hash: 'b'.repeat(64), display_summary: 'Approve exact Build?',
      created_at: '2026-08-21T00:00:00Z', correlation_id: 'corr-1',
    };
    const loaded = { ...interrupted, pendingInterrupt: pending };
    expect(reduceAgentThread(loaded, event(2, 'interrupt_resolved', { interrupt_id: 'interrupt-1' })).pendingInterrupt).toBeNull();
    expect(reduceAgentThread(loaded, event(2, 'resumed', { interrupt_id: 'interrupt-1' })).pendingInterrupt).toBeNull();
  });

  it('does not clear a newer pending interrupt when an older interrupt resolves', () => {
    const pending: AgentPendingInterrupt = {
      interrupt_id: 'interrupt-2', thread_id: 'thread-1', kind: 'clarification', reason: 'clarification',
      allowed_decisions: ['answer'], target_hash: 'a'.repeat(64),
      target_params_hash: 'b'.repeat(64), display_summary: 'Answer the next field.',
      created_at: '2026-08-21T00:00:00Z', correlation_id: 'corr-1',
    };
    const state = { ...initialAgentThreadState, pendingInterrupt: pending };

    const resolved = reduceAgentThread(
      state,
      event(1, 'interrupt_resolved', { interrupt_id: 'interrupt-1' }),
    );
    const resumed = reduceAgentThread(
      resolved,
      event(2, 'resumed', { interrupt_id: 'interrupt-1' }),
    );

    expect(resumed.pendingInterrupt).toEqual(pending);
  });

  it('starts a fresh active turn when a new event follows a terminal event', () => {
    const completed = reduceAgentThread(
      initialAgentThreadState,
      event(1, 'completed', { safe_summary: 'Lượt đầu đã xong.' }),
    );

    const resumed = reduceAgentThread(
      completed,
      event(2, 'plan_updated', { safe_summary: 'Đang xử lý yêu cầu tiếp theo.' }),
    );

    expect(resumed.completed).toBe(false);
    expect(resumed.failed).toBe(false);
  });

  it('can replay a selected durable thread from an explicit cursor instead of stale local state', async () => {
    const context: ProviderRequestContext = {
      projectId: 'project-a', projectToken: 'project-token', correlationId: 'corr-replay',
    };
    const { result } = renderHook(() => useAgentThread());
    act(() => result.current.applyEvent(event(8, 'tool_result')));

    act(() => result.current.connect('thread-2', context, 0));

    await waitFor(() => expect(apiClient.streamAgentEvents).toHaveBeenCalledWith(
      'thread-2',
      context,
      expect.any(Object),
      expect.objectContaining({ afterCursor: 0 }),
    ));
  });

  it('coalesces streamed event bursts at animation-frame cadence without reordering', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const context: ProviderRequestContext = {
      projectId: 'project-a', projectToken: 'project-token', correlationId: 'corr-batch',
    };
    const { result } = renderHook(() => useAgentThread());

    act(() => result.current.connect('thread-1', context, 0));
    await waitFor(() => expect(apiClient.streamAgentEvents).toHaveBeenCalledOnce());
    const callbacks = vi.mocked(apiClient.streamAgentEvents).mock.calls[0]?.[2];
    expect(callbacks).toBeDefined();

    await act(async () => {
      await callbacks!.onEvent(event(1, 'plan_created'));
      await callbacks!.onEvent(event(2, 'verification'));
    });
    expect(result.current.state.events).toEqual([]);
    expect(frames).toHaveLength(1);

    act(() => frames[0]!(16));
    expect(result.current.state.events.map((item) => item.cursor)).toEqual([1, 2]);
    expect(result.current.state.cursor).toBe(2);
  });

  it('reconciles durable events when the live stream does not deliver them', async () => {
    vi.useFakeTimers();
    const context: ProviderRequestContext = {
      projectId: 'project-a', projectToken: 'project-token', correlationId: 'corr-reconcile',
    };
    const interrupt = event(1, 'interrupt_required', { interrupt_id: 'interrupt-1' });
    let liveSignal: AbortSignal | undefined;
    vi.mocked(apiClient.streamAgentEvents).mockImplementation(async (_threadId, _context, callbacks, options) => {
      if (options?.live) {
        liveSignal = options.signal;
        await new Promise<void>((resolve) => options.signal?.addEventListener('abort', () => resolve(), { once: true }));
        return;
      }
      expect(options).toEqual(expect.objectContaining({ live: false, singleSnapshot: true, afterCursor: 0 }));
      await callbacks.onEvent(interrupt);
    });

    const { result, unmount } = renderHook(() => useAgentThread());
    act(() => result.current.connect('thread-1', context, 0));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.state.events.map((item) => item.event_type)).toEqual(['interrupt_required']);
    unmount();
    expect(liveSignal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});
