import { describe, expect, it } from 'vitest';
import { emptyEphemeralDraft, reduceEphemeralDraft, reduceAgentThread, initialAgentThreadState, type AgentEphemeralFrame, type AgentEvent } from '@/shared/api/agentTypes';
import { projectEphemeralDraft } from '@/components/forge/agentActivityView';

function assistantFrame(sequence: number, delta: string): AgentEphemeralFrame {
  return {
    event_id: 'transient-assistant',
    event_type: 'assistant_text_delta',
    thread_id: 'thread-1',
    step_id: null,
    correlation_id: 'corr-1',
    payload: { message_id: 'amsg-1', sequence, delta },
    created_at: '2026-08-22T00:00:00Z',
    ephemeral: true,
  };
}

function reasoningFrame(sequence: number, delta: string, segmentId = 'seg-1'): AgentEphemeralFrame {
  return {
    event_id: 'transient-reasoning',
    event_type: 'reasoning_summary_delta',
    thread_id: 'thread-1',
    step_id: null,
    correlation_id: 'corr-1',
    payload: { segment_id: segmentId, stage: 'analysis', sequence, delta },
    created_at: '2026-08-22T00:00:00Z',
    ephemeral: true,
  };
}

const fold = (frames: AgentEphemeralFrame[]) => frames.reduce(reduceEphemeralDraft, emptyEphemeralDraft);

describe('reduceEphemeralDraft', () => {
  it('assembles assistant deltas in sequence order', () => {
    const draft = fold([assistantFrame(1, 'Agent đã '), assistantFrame(2, 'dựng Definition.')]);
    expect(projectEphemeralDraft(draft).text).toBe('Agent đã dựng Definition.');
  });

  it('assembles out-of-order deltas correctly', () => {
    const draft = fold([assistantFrame(2, 'dựng Definition.'), assistantFrame(1, 'Agent đã ')]);
    expect(projectEphemeralDraft(draft).text).toBe('Agent đã dựng Definition.');
  });

  it('stops at a gap rather than splicing across missing text', () => {
    // Sequence 2 never arrived. Concatenating 1 and 3 would silently present
    // text the agent never produced in that order.
    const draft = fold([assistantFrame(1, 'Agent đã '), assistantFrame(3, 'xong.')]);
    expect(projectEphemeralDraft(draft).text).toBe('Agent đã ');
  });

  it('ignores a duplicate sequence, so a reconnect cannot double text', () => {
    const draft = fold([assistantFrame(1, 'Agent đã '), assistantFrame(1, 'Agent đã '), assistantFrame(2, 'xong.')]);
    expect(projectEphemeralDraft(draft).text).toBe('Agent đã xong.');
  });

  it('treats reasoning deltas as replacements, keeping the newest summary', () => {
    const draft = fold([reasoningFrame(1, 'Đang đọc mô hình'), reasoningFrame(2, 'Đang dựng Definition')]);
    expect(projectEphemeralDraft(draft).reasoning).toEqual([
      { segmentId: 'seg-1', stage: 'analysis', title: 'Đang dựng Definition' },
    ]);
  });

  it('keeps reasoning segments in first-seen order', () => {
    const draft = fold([
      reasoningFrame(1, 'Đang đọc mô hình', 'seg-a'),
      reasoningFrame(1, 'Đang dựng Definition', 'seg-b'),
    ]);
    expect(projectEphemeralDraft(draft).reasoning.map((row) => row.segmentId)).toEqual(['seg-a', 'seg-b']);
  });
});

describe('ephemeral redaction', () => {
  it('rejects a secret that straddles two token boundaries', () => {
    // Neither delta matches SENSITIVE_COPY alone. Filtering per-delta would let
    // this through in halves, which is why the assembled string is filtered.
    const draft = fold([assistantFrame(1, 'Khoá là sk-'), assistantFrame(2, 'abc123def456 nhé')]);
    expect(projectEphemeralDraft(draft).text).toBe('');
  });

  it('rejects reasoning copy that leaks chain-of-thought vocabulary', () => {
    const draft = fold([reasoningFrame(1, 'Đang xử lý chain-of-thought nội bộ')]);
    expect(projectEphemeralDraft(draft).reasoning).toEqual([]);
  });

  it('rejects a digest-shaped value in the reply', () => {
    const draft = fold([assistantFrame(1, 'Đã dựng với sha256:deadbeef')]);
    expect(projectEphemeralDraft(draft).text).toBe('');
  });
});

describe('draft lifecycle', () => {
  const terminal = (eventType: 'completed' | 'failed'): AgentEvent => ({
    event_id: `evt-${eventType}`,
    cursor: 5,
    event_type: eventType,
    thread_id: 'thread-1',
    step_id: null,
    correlation_id: 'corr-1',
    payload: {},
    created_at: '2026-08-22T00:00:00Z',
  });

  it('clears the draft at a terminal event so the next turn cannot inherit it', () => {
    const withDraft = { ...initialAgentThreadState, ephemeral: fold([assistantFrame(1, 'Agent đã dựng')]) };
    expect(projectEphemeralDraft(withDraft.ephemeral).text).not.toBe('');

    for (const eventType of ['completed', 'failed'] as const) {
      const next = reduceAgentThread(withDraft, terminal(eventType));
      expect(projectEphemeralDraft(next.ephemeral).text).toBe('');
      expect(projectEphemeralDraft(next.ephemeral).reasoning).toEqual([]);
    }
  });

  it('does not let an ephemeral frame advance the resume cursor', () => {
    // The draft lives outside `events` and `cursor` entirely (ADR-0008/BE-04):
    // folding frames cannot move the cursor a reconnect resumes from.
    const before = { ...initialAgentThreadState, cursor: 7 };
    const after = { ...before, ephemeral: fold([assistantFrame(1, 'Agent đã dựng')]) };
    expect(after.cursor).toBe(7);
    expect(after.events).toHaveLength(0);
  });
});
