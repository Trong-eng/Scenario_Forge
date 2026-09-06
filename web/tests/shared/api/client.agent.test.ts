import { describe, expect, it, vi } from 'vitest';
import { apiClient, type ProviderRequestContext } from '../../../src/shared/api/client';

const context: ProviderRequestContext = { projectId: 'p1', projectToken: 'token', correlationId: 'corr' };
const frame = (cursor: number, event_type = 'plan_created') => `id: ${cursor}\nevent: ${event_type}\ndata: ${JSON.stringify({ event_id: `e-${cursor}`, cursor, event_type, thread_id: 't1', step_id: null, correlation_id: 'c', payload: {}, created_at: '2026-08-21T00:00:00Z' })}\n\n`;
const eventFrame = (body: Record<string, unknown>) => `id: ${String(body.cursor)}\nevent: ${String(body.event_type)}\ndata: ${JSON.stringify(body)}\n\n`;
const response = (body: string) => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }), { status: 200 });
const brokenResponse = (body: string) => {
  let delivered = false;
  return new Response(new ReadableStream({
    pull(controller) {
      if (!delivered) {
        delivered = true;
        controller.enqueue(new TextEncoder().encode(body));
        return;
      }
      controller.error(new Error('socket closed'));
    },
  }), { status: 200 });
};

describe('agent event stream client', () => {
  it('accepts the two strict realtime delta payloads', async () => {
    const base = { thread_id: 't1', step_id: null, correlation_id: 'c', created_at: '2026-08-21T00:00:00Z' };
    const fetchMock = vi.fn().mockResolvedValue(response([
      eventFrame({ ...base, event_id: 'reason-1', cursor: 1, event_type: 'reasoning_summary_delta', payload: { segment_id: 'seg-1', stage: 'analysis', sequence: 1, delta: 'Đang kiểm tra ngữ cảnh.' } }),
      eventFrame({ ...base, event_id: 'assistant-1', cursor: 2, event_type: 'assistant_text_delta', payload: { message_id: 'msg-1', sequence: 1, delta: 'Đã hoàn tất.' } }),
      frame(3, 'completed'),
    ].join('')));
    vi.stubGlobal('fetch', fetchMock);
    const events: string[] = [];

    await apiClient.streamAgentEvents('t1', context, { onEvent: (item) => events.push(item.event_type) });

    expect(events).toEqual(['reasoning_summary_delta', 'assistant_text_delta', 'completed']);
  });

  it('advances past an unsupported envelope without exposing its payload', async () => {
    const unknown = eventFrame({
      event_id: 'future-1', cursor: 1, event_type: 'future_private_event', thread_id: 't1',
      step_id: null, correlation_id: 'c', payload: { raw_reasoning: 'never render this' },
      created_at: '2026-08-21T00:00:00Z',
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(unknown))
      .mockResolvedValueOnce(response(frame(2, 'completed')));
    vi.stubGlobal('fetch', fetchMock);
    const events: number[] = [];

    await apiClient.streamAgentEvents('t1', context, { onEvent: (item) => events.push(item.cursor) });

    expect(events).toEqual([2]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('after=1');
  });

  it('fails closed on a known realtime event with an invalid payload', async () => {
    const invalid = eventFrame({
      event_id: 'reason-1', cursor: 1, event_type: 'reasoning_summary_delta', thread_id: 't1',
      step_id: null, correlation_id: 'c', payload: { stage: 'analysis', sequence: 1, delta: 'missing segment' },
      created_at: '2026-08-21T00:00:00Z',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)));

    await expect(apiClient.streamAgentEvents('t1', context, { onEvent: () => undefined }, { maxRetries: 0 }))
      .rejects.toThrow('malformed');
  });
  it('resumes with the latest cursor and deduplicates at-least-once replay', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(`${frame(1)}${frame(1)}`))
      .mockResolvedValueOnce(response(frame(2, 'completed')));
    vi.stubGlobal('fetch', fetchMock);
    const events: number[] = [];
    await apiClient.streamAgentEvents('t1', context, { onEvent: (event) => events.push(event.cursor) }, { maxRetries: 1, retryDelayMs: 0 });
    expect(events).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('after=1');
  });

  it('can consume exactly one durable snapshot for live-stream reconciliation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(frame(1)));
    vi.stubGlobal('fetch', fetchMock);
    const events: number[] = [];

    await apiClient.streamAgentEvents(
      't1',
      context,
      { onEvent: (event) => events.push(event.cursor) },
      { live: false, singleSnapshot: true },
    );

    expect(events).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('can bypass the short Next rewrite only for long-running agent requests', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_AGENT_API_BASE_URL', 'http://localhost:8000');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      thread_id: 't1', project_id: 'p1', status: 'active', title: 'scenario', summary: 'scenario',
      turn_count: 1, created_at: '2026-08-21T00:00:00Z', updated_at: '2026-08-21T00:00:00Z',
      correlation_id: 'corr-response',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const isolated = await import('../../../src/shared/api/client');

    await isolated.apiClient.createAgentThread('scenario', context);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost:8000/api/v1/projects/p1/agent/threads',
    );
  });

  it('reconnects after a transport failure using the durable cursor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(brokenResponse(frame(1)))
      .mockResolvedValueOnce(response(frame(2, 'completed')));
    vi.stubGlobal('fetch', fetchMock);
    const reconnect = vi.fn();
    const events: number[] = [];
    await apiClient.streamAgentEvents('t1', context, { onEvent: (event) => events.push(event.cursor), onReconnect: reconnect }, { maxRetries: 2, retryDelayMs: 0 });
    expect(events).toEqual([1, 2]);
    expect(reconnect).toHaveBeenCalledWith(1, 1);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('after=1');
  });

  it('resets successful idle delay whenever the durable cursor advances', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(''))
      .mockResolvedValueOnce(response(frame(1)))
      .mockResolvedValueOnce(response(''))
      .mockResolvedValueOnce(response(frame(2, 'completed')));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const stream = apiClient.streamAgentEvents('t1', context, { onEvent: () => undefined });
      await vi.runAllTimersAsync();
      await stream;

      expect(setTimeoutSpy.mock.calls.map(([, delay]) => delay)).toEqual([150, 150]);
    } finally {
      vi.useRealTimers();
      setTimeoutSpy.mockRestore();
    }
  });

  it('keeps transport failures on their own exponential retry counter', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(brokenResponse(''))
      .mockResolvedValueOnce(brokenResponse(''))
      .mockResolvedValueOnce(brokenResponse(''))
      .mockResolvedValueOnce(response(''))
      .mockResolvedValueOnce(brokenResponse(''))
      .mockResolvedValueOnce(response(frame(1, 'completed')));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const stream = apiClient.streamAgentEvents('t1', context, { onEvent: () => undefined }, {
        maxRetries: 3,
        retryDelayMs: 100,
      });
      await vi.runAllTimersAsync();
      await stream;

      expect(setTimeoutSpy.mock.calls.map(([, delay]) => delay)).toEqual([100, 200, 400, 150, 100]);
    } finally {
      vi.useRealTimers();
      setTimeoutSpy.mockRestore();
    }
  });

  it('submits only the browser decision and optional answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'resolved', interrupt_id: 'interrupt-1', message_id: 'message-1', resumed: true,
      correlation_id: 'corr-response',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.decideAgentInterrupt('t1', 'interrupt-1', 'answer', context, 'Safe answer');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ decision: 'answer', answer: 'Safe answer' });
    expect(String(init.body)).not.toContain('token');
    expect(String(init.body)).not.toContain('target_hash');
  });

  it('reads a typed pending interrupt and accepts 204 as no pending gate', async () => {
    const pending = {
      interrupt_id: 'interrupt-1', thread_id: 't1', kind: 'approval', reason: 'approval',
      allowed_decisions: ['approve', 'reject'], target_hash: 'a'.repeat(64),
      target_params_hash: 'b'.repeat(64), display_summary: 'Approve exact Build?',
      created_at: '2026-08-21T00:00:00Z', correlation_id: 'corr-response',
      clarification: {
        field: 'weather',
        prompt: 'Thời tiết của scenario là gì?',
        choices: [
          { ordinal: 1, value: 'clear', label: 'Nắng' },
          { ordinal: 2, value: 'rain', label: 'Mưa' },
        ],
        allows_other: true,
        subject: 'pedestrian',
        actor_ref: 'pedestrian',
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(pending), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.getPendingAgentInterrupt('t1', context)).resolves.toEqual(pending);
    await expect(apiClient.getPendingAgentInterrupt('t1', context)).resolves.toBeNull();
  });

  it('lists agent threads with the server cursor and validates the strict page', async () => {
    const item = {
      thread_id: 't1', project_id: 'p1', status: 'active', title: 'Rain crossing',
      summary: 'A pedestrian crosses in rain.', turn_count: 2,
      created_at: '2026-08-21T00:00:00Z', updated_at: '2026-08-21T00:01:00Z',
      correlation_id: 'corr-response',
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [item], next_cursor: 'opaque-next', correlation_id: 'corr-response',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.listAgentThreads(context, 25, 'opaque-current')).resolves.toEqual({
      items: [item], next_cursor: 'opaque-next', correlation_id: 'corr-response',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/v1/projects/p1/agent/threads?limit=25&cursor=opaque-current',
    );

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ ...item, actor_ref: 'must-not-cross-browser-boundary' }],
      next_cursor: null,
      correlation_id: 'corr-response',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(apiClient.listAgentThreads(context)).rejects.toThrow();
  });

  it('reads safe transcript summaries and renames only the title', async () => {
    const transcript = {
      items: [{
        message_id: 'message-1', role: 'user', safe_summary: 'First prompt',
        created_at: '2026-08-21T00:00:00Z',
      }],
      correlation_id: 'corr-response',
    };
    const renamed = {
      thread_id: 't1', project_id: 'p1', status: 'active', title: 'New title',
      summary: 'Original immutable goal', turn_count: 1,
      created_at: '2026-08-21T00:00:00Z', updated_at: '2026-08-21T00:02:00Z',
      correlation_id: 'corr-response',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(transcript), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(renamed), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.getAgentTranscript('t1', context)).resolves.toEqual(transcript);
    await expect(apiClient.renameAgentThread('t1', 'New title', context)).resolves.toEqual(renamed);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/agent/threads/t1/messages');
    const renameInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(renameInit.method).toBe('PATCH');
    expect(JSON.parse(String(renameInit.body))).toEqual({ title: 'New title' });
  });
});
