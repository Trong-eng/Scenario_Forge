import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionConfig } from 'motion/react';
import { AgentActivityStream } from '../../../src/components/forge/AgentActivityStream';
import { emptyEphemeralDraft, reduceEphemeralDraft, type AgentEphemeralFrame, type AgentEvent } from '../../../src/shared/api/agentTypes';

const event = (
  cursor: number,
  event_type: AgentEvent['event_type'],
  payload: Record<string, unknown> = {},
  stepId = `step-${cursor}`,
): AgentEvent => ({
  event_id: `event-${cursor}`,
  cursor,
  event_type,
  thread_id: 'thread-1',
  step_id: stepId,
  correlation_id: 'corr-private',
  payload,
  created_at: '2026-08-22T00:00:00Z',
});

// Vitest's fake timers do not fake rAF, so the reveal driven by
// `useStreamingText` needs a queue the test can drain deterministically.
let animationFrames: Array<(time: number) => void> = [];
let frameClock = 0;

async function flushReveal(frames = 40) {
  for (let frame = 0; frame < frames && animationFrames.length; frame += 1) {
    frameClock += 16;
    const pending = animationFrames;
    animationFrames = [];
    await act(async () => { pending.forEach((callback) => callback(frameClock)); });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  animationFrames = [];
  frameClock = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AgentActivityStream canonical SSE renderer', () => {
  it('renders a bounded localized capability reply with a catalogue affordance', () => {
    const onOpenCapabilities = vi.fn();
    const summary = [
      '### Dùng được ngay',
      '- Theo làn',
      '',
      '### Có thể soạn, chưa thể chạy',
      '- Đổi làn',
      '',
      '### Dự kiến hoặc chưa khả dụng',
      '- Vượt xe chậm',
      '',
      'Hãy mô tả tình huống để bắt đầu. Xem thêm trong danh mục năng lực.',
    ].join('\n');
    const view = render(<AgentActivityStream events={[
      event(1, 'tool_result', {
        tool_name: 'scenario.capabilities.list',
        status: 'success',
        safe_summary: summary,
      }, 'capabilities'),
      event(2, 'completed', { status: 'COMPLETED', display_summary: summary }, 'capabilities'),
    ]} onOpenCapabilities={onOpenCapabilities} reducedMotion />);

    expect(view.container.querySelector('[data-capability-reply="true"]')).not.toBeNull();
    expect(screen.getByText('Dùng được ngay')).toBeDefined();
    expect(screen.getByText('Có thể soạn, chưa thể chạy')).toBeDefined();
    expect(screen.getByText('Dự kiến hoặc chưa khả dụng')).toBeDefined();
    expect(screen.queryByText(/traceback|runnable|capability-query/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mở danh mục năng lực' }));
    expect(onOpenCapabilities).toHaveBeenCalledTimes(1);
  });

  it('shows only a neutral transport state before the first durable event', () => {
    const view = render(<AgentActivityStream awaitingFirstEvent events={[]} startedAtMs={Date.now()} />);

    expect(screen.getByText('Đang bắt đầu…')).toBeDefined();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(view.container.querySelectorAll('[data-active-shimmer="true"]')).toHaveLength(1);
    expect(view.container.querySelector('[data-active-shimmer="true"]')?.getAttribute('data-shimmer-cycle')).toBe('650ms/1350ms');
    expect(view.container.querySelectorAll('[data-shimmer-sweep="true"]')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Nhật ký xử lý' })).toBeNull();
    expect(document.body.textContent).not.toContain('Đã hiểu yêu cầu');
    expect(document.body.textContent).not.toContain('Đang xử lý bước tiếp theo');
  });

  it('allows a running real tool to disclose the safe input being processed', () => {
    const view = render(<AgentActivityStream events={[
      event(1, 'reasoning_summary_delta', {
        segment_id: 'headline', stage: 'headline', sequence: 1,
        delta: 'Đang dựng kịch bản từ dữ kiện đã xác nhận',
      }),
      event(2, 'tool_started', {
        tool_name: 'author_definition',
        display_summary: 'Đang dựng Definition',
        display_detail: 'Actors: xe ego và người đi bộ · Map: Town05',
      }, 'author'),
    ]} />);

    const tool = screen.getByRole('button', { name: 'Đang dựng Definition' });
    const stream = view.container.querySelector<HTMLElement>('[data-agent-activity-stream="true"]');

    // The activity log is transcript content, not a nested column. Its left
    // edge must stay on the same reading rail as answers and artifacts.
    expect(stream?.className).toContain('w-full');
    expect(stream?.className).not.toContain('pl-');

    expect(tool.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Đang dựng Definition — chi tiết' }).textContent)
      .toContain('Actors: xe ego và người đi bộ · Map: Town05');
    fireEvent.click(tool);
    expect(tool.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the generated title and two-line preview in one running disclosure', () => {
    const reasoning = (segmentId: string, stage: string, delta: string): AgentEphemeralFrame => ({
      event_id: `transient-${segmentId}`,
      event_type: 'reasoning_summary_delta',
      thread_id: 'thread-1',
      step_id: null,
      correlation_id: 'corr-1',
      payload: { segment_id: segmentId, stage, sequence: 1, delta },
      created_at: '2026-08-22T00:00:00Z',
      ephemeral: true,
    });
    const draft = [
      reasoning('seg-title', 'intake', 'Đang phân tích tình huống người đi bộ'),
      reasoning('seg-preview', 'analysis', 'Đối chiếu actor, vận tốc ego và phần thông tin còn thiếu'),
    ].reduce(reduceEphemeralDraft, emptyEphemeralDraft);

    const view = render(<AgentActivityStream draft={draft} events={[
      event(1, 'reasoning_summary_delta', {
        segment_id: 'seg-title', stage: 'intake', sequence: 1, delta: 'Đang đọc nội dung yêu cầu.',
      }),
    ]} />);

    expect(screen.getByText('Đang phân tích tình huống người đi bộ')).toBeDefined();
    expect(screen.getByText('Đối chiếu actor, vận tốc ego và phần thông tin còn thiếu')).toBeDefined();
    expect(view.container.querySelectorAll('[data-reasoning-preview="true"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-active-shimmer="true"]')).toHaveLength(1);
  });

  it('does not schedule timer-driven renders while live elapsed time is hidden', () => {
    const interval = vi.spyOn(window, 'setInterval');

    render(<AgentActivityStream startedAtMs={Date.now()} events={[
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
    ]} />);

    expect(interval.mock.calls.filter(([, delay]) => delay === 100)).toHaveLength(0);
  });

  it('moves the highlight to only the newest active safe event title', () => {
    const view = render(<AgentActivityStream events={[
      event(1, 'plan_created', { safe_summary: 'Đã tách actor và hành vi.' }),
      event(2, 'tool_started', { display_summary: 'Tra topology và lane graph' }, 'topology'),
    ]} />);

    expect(view.container.querySelectorAll('[data-active="true"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-active-shimmer="true"]')).toHaveLength(1);
    expect(screen.getByText('Tra topology và lane graph').closest('[data-active]')?.getAttribute('data-active')).toBe('true');

    view.rerender(<AgentActivityStream events={[
      event(1, 'plan_created', { safe_summary: 'Đã tách actor và hành vi.' }),
      event(2, 'tool_started', { display_summary: 'Tra topology và lane graph' }, 'topology'),
      event(3, 'verification', { safe_summary: 'Đang kiểm tra Definition.' }, 'verify'),
    ]} />);

    expect(view.container.querySelectorAll('[data-active="true"]')).toHaveLength(1);
    expect(screen.queryByText('Đang kiểm tra Definition.')).toBeNull();
    expect(screen.getByText('Tra topology và lane graph').closest('[data-active]')?.getAttribute('data-active')).toBe('true');
  });

  it('keeps completed tool detail closed until the user opens it', () => {
    const view = render(<AgentActivityStream events={[
      event(1, 'tool_started', { tool_name: 'query_registry', display_summary: 'Tra topology và lane graph' }, 'topology'),
    ]} />);
    const title = screen.getByRole('button', { name: 'Tra topology và lane graph' });
    expect(title.getAttribute('data-reason-state')).toBe('running');
    expect(title.getAttribute('aria-expanded')).toBe('false');

    view.rerender(<AgentActivityStream events={[
      event(1, 'tool_started', { tool_name: 'query_registry', display_summary: 'Tra topology và lane graph' }, 'topology'),
      event(2, 'tool_result', {
        tool_name: 'query_registry',
        status: 'success',
        safe_summary: 'Đã tìm thấy lane graph phù hợp.',
        private_payload: 'never-render-this',
      }, 'topology'),
    ]} />);

    expect(title.getAttribute('data-reason-state')).toBe('completed');
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Đã tìm thấy lane graph phù hợp.')).toBeNull();
    expect(document.body.textContent).not.toContain('never-render-this');
    const titleText = screen.getByText('Đã tra cứu registry');
    expect(titleText.className).toContain('agent-text-interactive');
    expect(title.className).toContain('agent-activity-trigger');

    fireEvent.click(title);
    expect(title.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Đã tra cứu registry — chi tiết' })).toBeDefined();
    expect(view.container.querySelector('[data-activity-connector="true"]')).not.toBeNull();
  });

  it('uses the same inline disclosure grammar for reasoning and tool activity', async () => {
    const view = render(<AgentActivityStream events={[
      event(1, 'reasoning_summary_delta', {
        segment_id: 'seg-intake', stage: 'intake', sequence: 1,
        delta: 'Đang phân tích tình huống cắt ngang làn',
      }),
      event(2, 'reasoning_summary_delta', {
        segment_id: 'seg-analysis', stage: 'analysis', sequence: 1,
        delta: 'Đối chiếu actor, tốc độ và khoảng cách kích hoạt.',
      }),
    ]} />);

    const reasoning = screen.getByRole('button', { name: 'Đang phân tích tình huống cắt ngang làn' });
    expect(reasoning.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Đối chiếu actor, tốc độ và khoảng cách kích hoạt.')).toBeDefined();

    fireEvent.click(reasoning);
    expect(reasoning.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(reasoning);
    expect(reasoning.getAttribute('aria-expanded')).toBe('true');
    expect(view.container.querySelector('[data-activity-connector="true"]')).not.toBeNull();
  });

  it('moves the only live shimmer to the clarification wait step', () => {
    const view = render(<AgentActivityStream events={[
      event(1, 'tool_started', { tool_name: 'ground_scenario' }, 'ground'),
      event(2, 'interrupt_required', { display_summary: 'Hãy chọn bản đồ.' }, 'clarify'),
    ]} />);

    const waiting = screen.getByText('Cần thêm thông tin để tiếp tục');
    expect(waiting.closest('[data-active]')?.getAttribute('data-active')).toBe('true');
    expect(view.container.querySelectorAll('[data-active="true"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-active-shimmer="true"]')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Nhật ký xử lý' }).getAttribute('aria-busy')).toBe('true');
  });

  it('streams the safe final response as soon as its first delta arrives and collapses activity', async () => {
    const view = render(<AgentActivityStream events={[
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
    ]} />);
    expect(screen.queryByRole('button', { name: /đang xử lý/i })).toBeNull();
    expect(screen.getByRole('region', { name: 'Nhật ký xử lý' })).toBeDefined();

    view.rerender(<AgentActivityStream events={[
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
      event(2, 'message_delta', {
        channel: 'assistant', display_safe: true, delta: 'Definition đang được trình bày',
      }),
    ]} />);

    // The activity collapses on the first delta, before the text has finished
    // revealing — that is the ChatGPT ordering (spec §4.3).
    const summary = screen.getByRole('button', { name: /đã xử lý/i });
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    expect(summary.className).toContain('agent-text-meta');

    // The reply is now paced across animation frames by `useStreamingText`
    // rather than painted in one go, so the reveal has to be driven.
    await flushReveal();
    expect(screen.getByRole('article', { name: 'Agent response' }).textContent).toContain('Definition đang được trình bày');

    view.rerender(<AgentActivityStream events={[
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
      event(2, 'message_delta', {
        channel: 'assistant', display_safe: true, delta: 'Definition đang được trình bày',
      }),
      event(3, 'message_delta', {
        channel: 'assistant', display_safe: true, delta: ' theo từng phần.',
      }),
    ]} />);
    await flushReveal();
    expect(screen.getByRole('article', { name: 'Agent response' }).textContent).toContain('Definition đang được trình bày theo từng phần.');
  });

  it('opens a fresh activity stream when the same thread starts another turn', async () => {
    const firstTurn = [
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
      event(2, 'completed', { safe_summary: 'Lượt đầu đã hoàn tất.' }),
    ];
    const view = render(<AgentActivityStream events={firstTurn} />);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('button', { name: /đã xử lý/i }).getAttribute('aria-expanded')).toBe('false');

    view.rerender(<AgentActivityStream events={[
      ...firstTurn,
      event(3, 'plan_updated', { safe_summary: 'Đang xử lý yêu cầu tiếp theo.' }),
    ]} />);

    expect(screen.queryByRole('button', { name: /đang xử lý/i })).toBeNull();
    expect(screen.getByRole('region', { name: 'Nhật ký xử lý' })).toBeDefined();
    expect(screen.queryByRole('article', { name: 'Agent response' })).toBeNull();
  });

  it('fails closed on raw payloads and renders truthful terminal failure copy', async () => {
    const view = render(<AgentActivityStream events={[
      event(1, 'plan_created', { plan_id: 'plan-secret', thinking: 'hidden chain of thought' }),
      event(2, 'tool_started', { action_key: 'private-action' }, 'tool'),
      event(3, 'failed', { stack_trace: 'secret traceback', decision_token: 'private-token' }),
    ]} />);

    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('article', { name: 'Agent response' }).textContent).toContain('Agent đã dừng an toàn');
    expect(document.body.textContent).not.toContain('plan-secret');
    expect(document.body.textContent).not.toContain('hidden chain of thought');
    expect(document.body.textContent).not.toContain('private-action');
    expect(document.body.textContent).not.toContain('secret traceback');
    expect(document.body.textContent).not.toContain('private-token');
    expect(view.container.querySelectorAll('[data-active-shimmer="true"]')).toHaveLength(0);
  });

  it('preserves disclosure state while removing movement and delay for reduced motion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const view = render(<MotionConfig reducedMotion="always"><AgentActivityStream reducedMotion events={[
      event(1, 'tool_started', { safe_summary: 'Kiểm tra Definition schema' }, 'schema'),
      event(2, 'completed', { safe_summary: 'Đã hoàn tất.' }),
    ]} /></MotionConfig>);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(view.container.querySelectorAll('[data-active-shimmer="true"]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /đã xử lý/i }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('article', { name: 'Agent response' })).toBeDefined();
  });

  it('keeps live wall-clock timing when terminal events arrive in one batch', async () => {
    vi.setSystemTime(new Date('2026-08-22T00:00:20Z'));
    const startedAtMs = new Date('2026-08-22T00:00:00Z').getTime();
    render(<AgentActivityStream startedAtMs={startedAtMs} events={[
      event(1, 'plan_created'),
      event(2, 'failed', { safe_summary: 'Agent exhausted the bounded model repair budget.' }),
    ]} />);

    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('button', { name: /đã dừng sau 20,0 giây/i })).toBeDefined();
    expect(document.body.textContent).not.toContain('Agent exhausted');
  });

  it('omits an untrustworthy duration for restored terminal history', async () => {
    render(<AgentActivityStream reducedMotion events={[
      event(1, 'plan_created'),
      event(2, 'failed'),
    ]} />);

    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('button', { name: 'Đã dừng' })).toBeDefined();
    expect(document.body.textContent).not.toContain('0,1 giây');
  });

  it('renders the ephemeral draft while the turn runs, then lets durable text replace it', async () => {
    const assistant = (sequence: number, delta: string): AgentEphemeralFrame => ({
      event_id: 'transient-assistant',
      event_type: 'assistant_text_delta',
      thread_id: 'thread-1',
      step_id: null,
      correlation_id: 'corr-1',
      payload: { message_id: 'amsg-1', sequence, delta },
      created_at: '2026-08-22T00:00:00Z',
      ephemeral: true,
    });
    const running = [event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' })];
    const draft = [assistant(1, 'Agent đã dựng '), assistant(2, 'Definition.')]
      .reduce(reduceEphemeralDraft, emptyEphemeralDraft);

    const view = render(<AgentActivityStream events={running} draft={draft} />);
    await flushReveal();
    expect(screen.getByRole('article', { name: 'Agent response' }).textContent).toContain('Agent đã dựng Definition.');

    // The durable event carries the same message_id. It must replace the draft,
    // never append to it — otherwise the reply would render twice.
    view.rerender(<AgentActivityStream draft={draft} events={[
      ...running,
      event(2, 'assistant_text_delta', { message_id: 'amsg-1', sequence: 1, delta: 'Agent đã dựng Definition.' }),
      event(3, 'completed', {}),
    ]} />);
    await flushReveal();

    const text = screen.getByRole('article', { name: 'Agent response' }).textContent ?? '';
    expect(text).toContain('Agent đã dựng Definition.');
    expect(text.match(/Agent đã dựng Definition\./g)).toHaveLength(1);
  });

  it('offers copy and retry actions only once the turn has settled', async () => {
    const retry = vi.fn();
    const running = [event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' })];

    const view = render(<AgentActivityStream events={[
      ...running,
      event(2, 'assistant_text_delta', { message_id: 'amsg-1', sequence: 1, delta: 'Agent đã hoàn tất.' }),
    ]} onRetry={retry} />);
    await flushReveal();
    expect(screen.queryByLabelText('Chép câu trả lời')).toBeNull();

    view.rerender(<AgentActivityStream events={[
      ...running,
      event(2, 'assistant_text_delta', { message_id: 'amsg-1', sequence: 1, delta: 'Agent đã hoàn tất.' }),
      event(3, 'completed', {}),
    ]} onRetry={retry} />);
    await flushReveal();

    expect(screen.getByLabelText('Chép câu trả lời')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Thử lại yêu cầu'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('names an operator-cancelled turn as stopped on request, not as a failure', async () => {
    render(<AgentActivityStream startedAtMs={Date.now()} events={[
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
      event(2, 'assistant_text_delta', {
        message_id: 'amsg-1', sequence: 1, delta: 'Agent đã dừng lượt xử lý theo yêu cầu của bạn.',
      }),
      event(3, 'failed', { status: 'CANCELLED', reason: 'operator_cancelled' }),
    ]} />);
    await flushReveal();

    expect(screen.getByRole('button', { name: /đã dừng theo yêu cầu/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^đã dừng sau/i })).toBeNull();
  });

  it('still names an ordinary failure a failure', async () => {
    render(<AgentActivityStream startedAtMs={Date.now()} events={[
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
      event(2, 'failed', { status: 'FAILED' }),
    ]} />);
    await flushReveal();

    expect(screen.getByRole('button', { name: /đã dừng sau/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /theo yêu cầu/i })).toBeNull();
  });

  it('never paces durable text, which describes generation that already finished', async () => {
    // Bounded-replay decision: a reconnect replays the durable full-text event as one blob.
    // Animating it would be a typewriter over a completed answer.
    render(<AgentActivityStream events={[
      event(1, 'plan_created', { safe_summary: 'Đang lập kế hoạch.' }),
      event(2, 'assistant_text_delta', {
        message_id: 'amsg-1', sequence: 1, delta: 'Agent đã dựng xong Definition cho tình huống này.',
      }),
    ]} />);

    // No frames driven: the text is already fully painted.
    expect(screen.getByRole('article', { name: 'Agent response' }).textContent)
      .toContain('Agent đã dựng xong Definition cho tình huống này.');
  });

  it('collapses one segment of reasoning deltas into a single per-turn line', async () => {
    // Mirrors what a live turn now commits: an instant placeholder, then the
    // generated headline replacing it in the same `intake` segment. The column
    // must show one specific line, not three, and not the fixed placeholder.
    render(<AgentActivityStream startedAtMs={Date.now()} events={[
      event(1, 'reasoning_summary_delta', { segment_id: 'seg-intake', stage: 'intake', sequence: 1, delta: 'Đã nhận yêu cầu và bắt đầu phiên xử lý.' }),
      event(2, 'reasoning_summary_delta', { segment_id: 'seg-intake', stage: 'intake', sequence: 2, delta: 'Đang đọc nội dung yêu cầu.' }),
      event(3, 'reasoning_summary_delta', { segment_id: 'seg-intake', stage: 'intake', sequence: 3, delta: 'Đang phân tích tình huống người đi bộ băng qua trước xe ego' }),
    ]} />);
    await flushReveal();

    expect(screen.getByText('Đang phân tích tình huống người đi bộ băng qua trước xe ego')).toBeDefined();
    expect(screen.queryByText('Đã nhận yêu cầu và bắt đầu phiên xử lý.')).toBeNull();
    expect(screen.queryByText('Đang đọc nội dung yêu cầu.')).toBeNull();
  });

  it('lets the live draft override the committed placeholder for the same segment', async () => {
    const reasoning = (sequence: number, delta: string): AgentEphemeralFrame => ({
      event_id: 'transient-reasoning',
      event_type: 'reasoning_summary_delta',
      thread_id: 'thread-1',
      step_id: null,
      correlation_id: 'corr-1',
      payload: { segment_id: 'seg-intake', stage: 'intake', sequence, delta },
      created_at: '2026-08-22T00:00:00Z',
      ephemeral: true,
    });
    const draft = [reasoning(1, 'Đang phân tích tình huống người đi bộ')]
      .reduce(reduceEphemeralDraft, emptyEphemeralDraft);

    render(<AgentActivityStream draft={draft} startedAtMs={Date.now()} events={[
      event(1, 'reasoning_summary_delta', { segment_id: 'seg-intake', stage: 'intake', sequence: 1, delta: 'Đã nhận yêu cầu và bắt đầu phiên xử lý.' }),
    ]} />);
    await flushReveal();

    // Reasoning deltas replace, and while a turn runs the draft is the newest
    // text — so it overwrites the placeholder rather than adding a second row.
    expect(screen.getByText('Đang phân tích tình huống người đi bộ')).toBeDefined();
    expect(screen.queryByText('Đã nhận yêu cầu và bắt đầu phiên xử lý.')).toBeNull();
  });

  it('does not re-render the disclosure while the answer streams', async () => {
    // The regression gate for the reveal refactor. `useStreamingText` sets state
    // once per animation frame; while it lived in this component every frame
    // re-rendered the whole column, and the markdown re-parsed the entire answer
    // — cost growing with answer length. It now lives inside a memoised answer
    // subtree, so a frame must not disturb anything outside it.
    //
    // Asserting DOM node IDENTITY rather than a render counter is deliberate: it
    // is immune to React internals, and it is what encodes the bounded-replay rule (decision 032)
    // that an active overlay must not be remounted when streamed text changes.
    // (The activity rows themselves are collapsed here — the first answer
    // character closes the outer disclosure — so the disclosure is the element
    // outside the answer subtree that must stay put.)
    const assistant = (sequence: number, delta: string): AgentEphemeralFrame => ({
      event_id: 'transient-assistant',
      event_type: 'assistant_text_delta',
      thread_id: 'thread-1',
      step_id: null,
      correlation_id: 'corr-1',
      payload: { message_id: 'amsg-1', sequence, delta },
      created_at: '2026-08-22T00:00:00Z',
      ephemeral: true,
    });
    const running = [event(1, 'tool_started', { tool_name: 'author_definition' }, 'author')];
    const draft = [assistant(1, 'Agent đang dựng Definition cho tình huống người đi bộ. '.repeat(4))]
      .reduce(reduceEphemeralDraft, emptyEphemeralDraft);

    const view = render(<AgentActivityStream events={running} draft={draft} startedAtMs={Date.now()} />);

    const disclosureBefore = view.container.querySelector('button[aria-expanded]');
    const articleBefore = screen.getByRole('article', { name: 'Agent response' });
    expect(disclosureBefore).not.toBeNull();

    const shownBefore = articleBefore.textContent ?? '';
    await flushReveal(6);
    const shownAfter = screen.getByRole('article', { name: 'Agent response' }).textContent ?? '';

    // The reveal really did advance, so the identity checks below mean something.
    expect(shownAfter.length).toBeGreaterThan(shownBefore.length);

    expect(view.container.querySelector('button[aria-expanded]')).toBe(disclosureBefore);
    expect(screen.getByRole('article', { name: 'Agent response' })).toBe(articleBefore);
  });

  it('shows elapsed time while the turn is still running', async () => {
    // Homeowner feedback 2026-08-23: the column showed how long a turn took only
    // AFTER it finished, so a running turn had no header at all. The heading is
    // deliberately not a button (there is nothing to toggle while the region is
    // force-open) and deliberately does not shimmer — exactly one live shimmer
    // exists at a time and it belongs to the operation actually running.
    render(<AgentActivityStream startedAtMs={Date.now() - 4200} events={[
      event(1, 'tool_started', { tool_name: 'author_definition' }, 'author'),
    ]} />);

    const heading = screen.getByRole('status');
    expect(heading.textContent).toMatch(/Đang suy luận trong/);
    expect(heading.querySelector('[data-active-shimmer="true"]')).toBeNull();
  });
});
