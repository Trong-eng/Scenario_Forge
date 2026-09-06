import { describe, expect, it } from 'vitest';
import { projectAgentActivity } from '../../../src/components/forge/agentActivityView';
import type { AgentEvent } from '../../../src/shared/api/agentTypes';

const event = (
  cursor: number,
  event_type: AgentEvent['event_type'],
  payload: Record<string, unknown> = {},
  stepId: string | null = `step-${cursor}`,
): AgentEvent => ({
  event_id: `event-${cursor}`,
  cursor,
  event_type,
  thread_id: 'thread-1',
  step_id: stepId,
  correlation_id: 'corr-private',
  payload,
  created_at: `2026-08-22T00:00:0${cursor}Z`,
});

describe('projectAgentActivity', () => {
  it('projects reasoning as one continuous disclosure and ignores graph-stage prose', () => {
    const view = projectAgentActivity([
      event(1, 'plan_created', { safe_summary: 'Đã lập kế hoạch xử lý cho yêu cầu này.' }),
      event(2, 'reasoning_summary_delta', {
        // Real contract stages. `stage` is a Literal of
        // intake|analysis|planning|execution|verification, so a test that fed
        // 'headline'/'summary' was exercising a shape the wire cannot carry.
        segment_id: 'seg-headline', stage: 'intake', sequence: 1,
        delta: 'Đang xác định actors và điều kiện xung đột',
      }),
      event(3, 'reasoning_summary_delta', {
        segment_id: 'seg-summary', stage: 'analysis', sequence: 1,
        delta: 'Đã nhận ra xe ego và người đi bộ trên Town05.',
      }),
      event(4, 'verification', { safe_summary: 'Đang kiểm tra kết quả thu được.' }),
    ]);

    expect(view.reasoning).toEqual({
      title: 'Đang xác định actors và điều kiện xung đột',
      body: 'Đã nhận ra xe ego và người đi bộ trên Town05.',
    });
    expect(view.rows).toEqual([]);
  });

  it('keeps inspectable detail on a real tool while it is still running', () => {
    const view = projectAgentActivity([
      event(1, 'tool_started', {
        tool_name: 'author_definition',
        display_summary: 'Đang dựng Definition',
        display_detail: 'Actors: xe ego và người đi bộ · Map: Town05',
      }, 'author'),
    ]);

    expect(view.rows[0]).toMatchObject({
      id: 'author',
      kind: 'tool',
      state: 'active',
      detail: 'Actors: xe ego và người đi bộ · Map: Town05',
    });
  });

  it('changes a paired tool title from active to completed wording', () => {
    const active = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'author_definition' }, 'author'),
    ]);
    const completed = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'author_definition' }, 'author'),
      event(2, 'tool_result', {
        tool_name: 'author_definition', status: 'success', definition_id: 'definition-1',
      }, 'author'),
    ]);

    expect(active.rows[0]).toMatchObject({ title: 'Đang dựng Definition', state: 'active' });
    expect(completed.rows[0]).toMatchObject({ title: 'Đã dựng Definition', state: 'complete' });
  });

  it('calls an authoring success a draft until a durable Definition id exists', () => {
    const draft = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'author_definition' }, 'author'),
      event(2, 'tool_result', {
        tool_name: 'author_definition', status: 'success', definition_id: null,
      }, 'author'),
    ]);

    expect(draft.rows[0]).toMatchObject({
      title: 'Đã hoàn thiện bản nháp',
      state: 'complete',
    });
  });

  it('does not claim a Definition was built when the tool returned a clarification', () => {
    const view = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'author_definition' }, 'author'),
      event(2, 'tool_result', {
        tool_name: 'author_definition',
        status: 'clarification',
        safe_summary: 'Bạn muốn đặt khoảng cách là bao nhiêu?',
      }, 'author'),
    ]);

    expect(view.rows[0]).toMatchObject({
      title: 'Đã xác định thông tin còn thiếu',
      state: 'complete',
    });
  });

  it('groups repairs under their owning tool even when another event intervenes', () => {
    const view = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'author_definition' }, 'author'),
      event(2, 'repair_attempt', { attempt: 1 }, 'author'),
      event(3, 'verification', { safe_summary: 'Đang kiểm tra dữ liệu đã dựng.' }, 'verify'),
      event(4, 'repair_attempt', { attempt: 2 }, 'author'),
      event(5, 'tool_result', {
        tool_name: 'author_definition', status: 'success', definition_id: 'definition-1',
      }, 'author'),
    ]);

    expect(view.rows.map((row) => row.kind)).toEqual(['tool']);
    expect(view.rows.find((row) => row.id === 'author')).toMatchObject({
      title: 'Đã dựng Definition',
      adjustmentCount: 2,
    });
  });

  it('preserves a projected tool and repairs when durable replay has no tool_started event', () => {
    const view = projectAgentActivity([
      event(1, 'plan_created'),
      event(2, 'repair_attempt', { attempt: 1 }, 'author'),
      event(3, 'repair_attempt', { attempt: 2 }, 'author'),
      event(4, 'tool_result', {
        tool_name: 'author_definition',
        status: 'success',
        definition_id: 'definition-1',
        safe_summary: 'Đã tạo Definition để bạn kiểm tra.',
      }, 'author'),
    ]);

    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      kind: 'tool',
      title: 'Đã dựng Definition',
      adjustmentCount: 2,
      state: 'complete',
    });
  });

  it('maps canonical registry tool names and never gives a failed tool success wording', () => {
    const grounded = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'ground_definition' }, 'ground'),
      event(2, 'tool_result', { tool_name: 'ground_definition', status: 'success' }, 'ground'),
      event(3, 'tool_started', { tool_name: 'build_scenario' }, 'build'),
    ]);
    const failed = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'author_definition' }, 'author'),
      event(2, 'tool_result', { tool_name: 'author_definition', status: 'failed' }, 'author'),
    ]);

    expect(grounded.rows.map((row) => row.title)).toEqual([
      'Đã đối chiếu dữ liệu CARLA',
      'Đang chuẩn bị Scenic Build',
    ]);
    expect(failed.rows[0]).toMatchObject({ title: 'Chưa thể dựng Definition', state: 'failed' });
  });

  it.each([
    ['read_model', 'Đã đọc mô hình'],
    ['author_interpret', 'Đã diễn giải yêu cầu'],
    ['request_approval', 'Đã chuẩn bị yêu cầu phê duyệt'],
    ['dispatch_run', 'Đã khởi chạy mô phỏng'],
    ['evaluate_scenario', 'Đã đánh giá scenario'],
    ['query_registry', 'Đã tra cứu registry'],
  ])('uses completed wording for canonical tool %s', (toolName, completedTitle) => {
    const view = projectAgentActivity([
      event(1, 'tool_started', { tool_name: toolName }, 'canonical'),
      event(2, 'tool_result', { tool_name: toolName, status: 'success' }, 'canonical'),
    ]);

    expect(view.rows[0]).toMatchObject({ title: completedTitle, state: 'complete' });
  });

  it('consumes an unscoped pending adjustment after attaching it to the nearest tool', () => {
    const view = projectAgentActivity([
      event(1, 'repair_attempt', { attempt: 1 }, null),
      event(2, 'tool_result', { tool_name: 'read_model', status: 'success' }, 'read'),
      event(3, 'tool_result', { tool_name: 'query_registry', status: 'success' }, 'registry'),
    ]);

    expect(view.rows.map((row) => row.adjustmentCount)).toEqual([1, 0]);
  });

  it('buffers a step-scoped repair for its own future tool instead of the previous tool', () => {
    const view = projectAgentActivity([
      event(1, 'tool_result', { tool_name: 'read_model', status: 'success' }, 'read'),
      event(2, 'repair_attempt', { attempt: 1 }, 'author'),
      event(3, 'tool_result', { tool_name: 'author_definition', status: 'success' }, 'author'),
    ]);

    expect(view.rows.map(({ id, adjustmentCount }) => ({ id, adjustmentCount }))).toEqual([
      { id: 'read', adjustmentCount: 0 },
      { id: 'author', adjustmentCount: 1 },
    ]);
  });

  it('does not complete an earlier active tool with a result from another explicit step', () => {
    const view = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'read_model' }, 'read'),
      event(2, 'tool_result', {
        tool_name: 'author_definition', status: 'success', definition_id: 'definition-1',
      }, 'author'),
    ]);

    expect(view.rows.map(({ id, title, state }) => ({ id, title, state }))).toEqual([
      { id: 'read', title: 'Đang đọc mô hình', state: 'active' },
      { id: 'author', title: 'Đã dựng Definition', state: 'complete' },
    ]);
  });

  it('pairs a tool lifecycle by step without creating a second row', () => {
    const view = projectAgentActivity([
      event(1, 'tool_started', {
        tool_name: 'author_definition',
        display_summary: 'Đang dựng Definition',
      }, 'author'),
      event(2, 'tool_result', {
        tool_name: 'author_definition',
        status: 'success',
        definition_id: 'definition-1',
        safe_summary: 'Đã tạo Definition để bạn kiểm tra.',
      }, 'author'),
    ]);

    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      id: 'author',
      title: 'Đã dựng Definition',
      detail: 'Đã tạo Definition để bạn kiểm tra.',
      state: 'complete',
    });
  });

  it('treats an interrupt as a static waiting boundary with no active row', () => {
    const view = projectAgentActivity([
      event(1, 'tool_started', { tool_name: 'ground_scenario' }, 'ground'),
      event(2, 'interrupt_required', { display_summary: 'Hãy chọn bản đồ.' }, 'clarify'),
    ]);

    expect(view.rows.at(-1)).toMatchObject({
      kind: 'waiting',
      title: 'Cần thêm thông tin để tiếp tục',
      state: 'complete',
    });
    expect(view.rows.some((row) => row.state === 'active')).toBe(false);
  });

  it('does not render internal resume and resolution events as peer steps', () => {
    const view = projectAgentActivity([
      event(1, 'interrupt_required', {}, 'clarify'),
      event(2, 'interrupt_resolved', {}, 'clarify'),
      event(3, 'resumed', {}, 'clarify'),
    ]);

    expect(view.rows).toEqual([]);
  });

  it('keeps graph summaries out of the semantic operation list', () => {
    const view = projectAgentActivity([
      event(1, 'plan_created', { safe_summary: 'Mình đang xác định actor và quan hệ xung đột.' }),
      event(2, 'tool_started', { tool_name: 'ground_scenario' }, 'ground'),
      event(3, 'tool_result', { tool_name: 'ground_scenario', status: 'success' }, 'ground'),
      event(4, 'verification', { safe_summary: 'Mình đang đối chiếu các ràng buộc an toàn.' }),
      event(5, 'tool_started', { tool_name: 'author_definition' }, 'author'),
    ]);

    expect(view.rows.map(({ kind, title }) => ({ kind, title }))).toEqual([
      { kind: 'tool', title: 'Đã đối chiếu dữ liệu CARLA' },
      { kind: 'tool', title: 'Đang dựng Definition' },
    ]);
  });

  it('does not expose backend stages as fixed visible headings', () => {
    const view = projectAgentActivity([
      event(1, 'plan_created', { stage: 'intake' }),
      event(2, 'plan_updated', { stage: 'analysis' }),
      event(3, 'verification', { stage: 'verification' }),
    ]);

    expect(view.rows).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/intake|analysis|verification/);
  });

  it('fails closed instead of rendering arbitrary English provider output', () => {
    const privateProviderCopy = 'Agent exhausted the bounded model repair budget.';
    const view = projectAgentActivity([
      event(1, 'repair_attempt', { safe_summary: privateProviderCopy }),
      event(2, 'failed', {
        safe_summary: privateProviderCopy,
        stack_trace: 'private traceback',
      }),
    ]);

    expect(view.rows).toHaveLength(0);
    expect(view.finalText).toBe('Agent đã dừng an toàn vì chưa thể hoàn tất yêu cầu này. Bạn có thể bổ sung thông tin hoặc thử lại.');
    expect(JSON.stringify(view)).not.toContain(privateProviderCopy);
    expect(JSON.stringify(view)).not.toContain('private traceback');
  });

  it('keeps display-safe assistant deltas separate and ordered', () => {
    const view = projectAgentActivity([
      event(1, 'plan_created'),
      event(2, 'message_delta', { channel: 'assistant', display_safe: true, delta: 'Definition đã ' }),
      event(3, 'message_delta', { channel: 'assistant', display_safe: true, delta: 'sẵn sàng.' }),
      event(4, 'completed'),
    ]);

    expect(view.rows).toEqual([]);
    expect(view.finalText).toBe('Definition đã sẵn sàng.');
    expect(view.terminal).toBe('completed');
  });

  it('updates one continuous reasoning disclosure in sequence order without exposing stage names', () => {
    const view = projectAgentActivity([
      event(1, 'reasoning_summary_delta', {
        segment_id: 'segment-intake', stage: 'intake', sequence: 2,
        delta: 'Đang đọc nội dung yêu cầu.',
      }),
      event(2, 'reasoning_summary_delta', {
        segment_id: 'segment-intake', stage: 'intake', sequence: 1,
        delta: 'Đã nhận yêu cầu và bắt đầu phiên xử lý.',
      }),
      event(3, 'reasoning_summary_delta', {
        segment_id: 'segment-analysis', stage: 'analysis', sequence: 1,
        delta: 'Đang đối chiếu ngữ cảnh dự án.',
      }),
    ]);

    expect(view.rows).toEqual([]);
    expect(view.reasoning).toEqual({
      title: 'Đang đọc nội dung yêu cầu.',
      body: 'Đang đối chiếu ngữ cảnh dự án.',
    });
    expect(JSON.stringify(view)).not.toMatch(/"intake"|"analysis"/);
  });

  it('assembles only contiguous assistant text deltas per message and ignores duplicate event ids', () => {
    const duplicate = event(2, 'assistant_text_delta', {
      message_id: 'assistant-1', sequence: 2, delta: 'sẵn sàng.',
    });
    const view = projectAgentActivity([
      event(1, 'assistant_text_delta', {
        message_id: 'assistant-1', sequence: 1, delta: 'Definition đã ',
      }),
      duplicate,
      { ...duplicate, cursor: 3 },
      event(4, 'assistant_text_delta', {
        message_id: 'assistant-1', sequence: 4, delta: ' Không được nối khi thiếu sequence 3.',
      }),
      event(5, 'completed'),
    ]);

    expect(view.finalText).toBe('Definition đã sẵn sàng.');
  });

  it('fails closed when the explicit assistant channel contains an internal repair diagnostic', () => {
    const privateDiagnostic = 'Agent exhausted the bounded model repair budget.';
    const view = projectAgentActivity([
      event(1, 'assistant_text_delta', {
        message_id: 'assistant-1', sequence: 1, delta: privateDiagnostic,
      }),
      event(2, 'failed'),
    ]);

    expect(view.finalText).toBe('Agent đã dừng an toàn vì chưa thể hoàn tất yêu cầu này. Bạn có thể bổ sung thông tin hoặc thử lại.');
    expect(JSON.stringify(view)).not.toContain(privateDiagnostic);
  });

  it('ignores deltas without an explicit display-safe marker', () => {
    const view = projectAgentActivity([
      event(1, 'message_delta', { channel: 'assistant', delta: 'hidden reasoning' }),
      event(2, 'completed'),
    ]);

    expect(view.finalText).toBe('Agent đã hoàn tất lượt xử lý này.');
    expect(JSON.stringify(view)).not.toContain('hidden reasoning');
  });
});
