import type { AgentEphemeralDraft, AgentEvent } from '@/shared/api/agentTypes';

export type ActivityViewRow = {
  id: string;
  kind: 'tool' | 'prose' | 'waiting';
  title: string;
  detail: string | null;
  state: 'active' | 'complete' | 'failed';
  count: number;
  adjustmentCount: number;
  sourceCursor: number;
};

export type AgentActivityView = {
  rows: ActivityViewRow[];
  reasoning: { title: string; body: string } | null;
  terminal: 'running' | 'completed' | 'failed';
  finalText: string;
  replyKind: 'capability' | null;
};

const SENSITIVE_COPY = /(?:sha256:|[a-f0-9]{32,}|sk-[a-z0-9]+|decision_token|private-capability|\bthinking\b|chain[- ]of[- ]thought|action_key|author_definition|plan-[a-z0-9_-]+|interrupt-[a-z0-9_-]+|corr-[a-z0-9_-]+|step-hidden|worker_resume_key|traceback|stack trace|bounded model repair budget|agent exhausted|model repair)/i;
const VIETNAMESE_COPY = /(?:[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]|\b(?:đã|đang|cần|chưa|không|bạn|và|yêu cầu|kết quả|hoàn tất|sẵn sàng|xử lý|kiểm tra|tạo|dựng|tìm thấy)\b)/iu;

function payloadText(event: AgentEvent, key: 'display_summary' | 'display_detail' | 'safe_summary' | 'delta') {
  const value = event.payload[key];
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, 4096);
  if (!text || SENSITIVE_COPY.test(text) || !VIETNAMESE_COPY.test(text)) return null;
  return text;
}

function displayDelta(event: AgentEvent) {
  const value = event.payload.delta;
  if (typeof value !== 'string') return null;
  const text = value.slice(0, 4096);
  const checked = text.trim();
  if (!checked || SENSITIVE_COPY.test(checked) || !VIETNAMESE_COPY.test(checked)) return null;
  return text;
}

function explicitDisplayDelta(event: AgentEvent) {
  const value = event.payload.delta;
  if (typeof value !== 'string') return null;
  const text = value.slice(0, 4096);
  const checked = text.trim();
  if (!checked || SENSITIVE_COPY.test(checked)) return null;
  return text;
}

function displaySummary(event: AgentEvent) {
  return payloadText(event, 'display_summary') ?? payloadText(event, 'safe_summary');
}

function payloadStatus(event: AgentEvent) {
  return typeof event.payload.status === 'string' ? event.payload.status.toLowerCase() : '';
}

function resultFailed(event: AgentEvent) {
  return ['failed', 'error', 'rejected'].includes(payloadStatus(event));
}

type ToolCopy = { active: string; complete: string; failed: string };

function toolCopy(event: AgentEvent, fallback = 'Đang xử lý bước tiếp theo'): ToolCopy {
  const localized = payloadText(event, 'display_summary');
  const withLocalizedActive = (copy: ToolCopy): ToolCopy => localized ? { ...copy, active: localized } : copy;
  switch (event.payload.tool_name) {
    case 'read_model': return withLocalizedActive({ active: 'Đang đọc mô hình', complete: 'Đã đọc mô hình', failed: 'Chưa thể đọc mô hình' });
    case 'author_interpret': return withLocalizedActive({ active: 'Đang diễn giải yêu cầu', complete: 'Đã diễn giải yêu cầu', failed: 'Chưa thể diễn giải yêu cầu' });
    case 'author_definition': return withLocalizedActive({
      active: 'Đang dựng Definition',
      complete: payloadStatus(event) === 'clarification'
        ? 'Đã xác định thông tin còn thiếu'
        : typeof event.payload.definition_id === 'string' && event.payload.definition_id.trim()
          ? 'Đã dựng Definition'
          : 'Đã hoàn thiện bản nháp',
      failed: 'Chưa thể dựng Definition',
    });
    case 'ground_definition':
    case 'ground_scenario': return withLocalizedActive({ active: 'Đang đối chiếu dữ liệu CARLA', complete: 'Đã đối chiếu dữ liệu CARLA', failed: 'Chưa thể đối chiếu dữ liệu CARLA' });
    case 'build_scenario':
    case 'build_scenic': return withLocalizedActive({ active: 'Đang chuẩn bị Scenic Build', complete: 'Đã chuẩn bị Scenic Build', failed: 'Chưa thể chuẩn bị Scenic Build' });
    case 'request_approval': return withLocalizedActive({ active: 'Đang chuẩn bị yêu cầu phê duyệt', complete: 'Đã chuẩn bị yêu cầu phê duyệt', failed: 'Chưa thể chuẩn bị yêu cầu phê duyệt' });
    case 'dispatch_run': return withLocalizedActive({ active: 'Đang khởi chạy mô phỏng', complete: 'Đã khởi chạy mô phỏng', failed: 'Chưa thể khởi chạy mô phỏng' });
    case 'evaluate_scenario': return withLocalizedActive({ active: 'Đang đánh giá scenario', complete: 'Đã đánh giá scenario', failed: 'Chưa thể đánh giá scenario' });
    case 'query_registry': return withLocalizedActive({ active: 'Đang tra cứu registry', complete: 'Đã tra cứu registry', failed: 'Chưa thể tra cứu registry' });
    default: {
      return { active: localized ?? fallback, complete: 'Đã hoàn tất bước xử lý', failed: 'Bước xử lý chưa hoàn tất' };
    }
  }
}

function completeActiveRows(rows: ActivityViewRow[]) {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.state === 'active') rows[index] = { ...rows[index]!, state: 'complete' };
  }
}

function terminalState(events: readonly AgentEvent[]): AgentActivityView['terminal'] {
  const last = events.at(-1);
  if (last?.event_type === 'completed') return 'completed';
  if (last?.event_type === 'failed') return 'failed';
  return 'running';
}

function finalText(events: readonly AgentEvent[], terminal: AgentActivityView['terminal']) {
  const assistantMessages = new Map<string, Map<number, string>>();
  for (const event of events) {
    if (event.event_type !== 'assistant_text_delta') continue;
    const messageId = event.payload.message_id;
    const sequence = event.payload.sequence;
    const delta = explicitDisplayDelta(event);
    if (typeof messageId !== 'string' || !Number.isInteger(sequence) || Number(sequence) < 1 || !delta) continue;
    const parts = assistantMessages.get(messageId) ?? new Map<number, string>();
    if (!parts.has(Number(sequence))) parts.set(Number(sequence), delta);
    assistantMessages.set(messageId, parts);
  }
  let assistantText = '';
  for (const parts of assistantMessages.values()) {
    let text = '';
    for (let sequence = 1; parts.has(sequence); sequence += 1) text += parts.get(sequence);
    if (text) assistantText = text;
  }
  if (assistantText) return assistantText;

  const deltas = events
    .filter((event) => event.event_type === 'message_delta'
      && event.payload.channel === 'assistant'
      && event.payload.display_safe === true)
    .map((event) => displayDelta(event))
    .filter((value): value is string => Boolean(value));
  if (deltas.length) return deltas.join('');

  const terminalEvent = events.at(-1);
  const terminalCopy = terminalEvent && terminal !== 'running' ? displaySummary(terminalEvent) : null;
  if (terminalCopy) return terminalCopy;
  if (terminal === 'failed') return 'Agent đã dừng an toàn vì chưa thể hoàn tất yêu cầu này. Bạn có thể bổ sung thông tin hoặc thử lại.';
  if (terminal === 'completed') return 'Agent đã hoàn tất lượt xử lý này.';
  return '';
}

/** The turn-in-flight draft, assembled from ephemeral frames (ADR-0008). */
export type AgentDraftView = {
  /** Reply text so far. Empty once the durable event supersedes it. */
  text: string;
  /** Live reasoning summaries, keyed by the same `segment_id` the durable rows use. */
  reasoning: { segmentId: string; stage: string; title: string }[];
};

/** Assemble parts 1..N while they are contiguous; a gap ends the run. */
function contiguousParts(parts: Record<number, string>): string[] {
  const ordered: string[] = [];
  for (let sequence = 1; parts[sequence] !== undefined; sequence += 1) ordered.push(parts[sequence]!);
  return ordered;
}

/**
 * Project the ephemeral draft through the *same* fail-closed copy filters as
 * the durable channel.
 *
 * Filtering the assembled string rather than each delta is deliberate: a
 * secret-shaped value can straddle two token boundaries, and per-delta checks
 * would wave it through in halves.
 */
export function projectEphemeralDraft(draft: AgentEphemeralDraft): AgentDraftView {
  let text = '';
  for (const parts of Object.values(draft.assistant)) {
    const assembled = contiguousParts(parts).join('');
    if (assembled) text = assembled;
  }
  if (text && SENSITIVE_COPY.test(text.trim())) text = '';

  const reasoning: AgentDraftView['reasoning'] = [];
  for (const segmentId of draft.reasoningOrder) {
    const segment = draft.reasoning[segmentId];
    if (!segment) continue;
    // Reasoning deltas replace rather than accumulate, matching the durable
    // projection above: the newest contiguous part is the whole summary.
    const title = contiguousParts(segment.parts).at(-1)?.trim() ?? '';
    if (!title || SENSITIVE_COPY.test(title) || !VIETNAMESE_COPY.test(title)) continue;
    reasoning.push({ segmentId, stage: segment.stage, title });
  }
  return { text, reasoning };
}

export function projectAgentActivity(events: readonly AgentEvent[]): AgentActivityView {
  const seenEventIds = new Set<string>();
  const uniqueEvents = events.filter((event) => {
    if (seenEventIds.has(event.event_id)) return false;
    seenEventIds.add(event.event_id);
    return true;
  });
  const terminal = terminalState(uniqueEvents);
  const rows: ActivityViewRow[] = [];
  const toolsByStep = new Map<string, number>();
  const reasoningBySegment = new Map<string, { stage: string; parts: Map<number, string> }>();
  let reasoningTitle = '';
  let reasoningBody = '';
  let replyKind: AgentActivityView['replyKind'] = null;
  const pendingAdjustments = new Map<string, number>();
  const takePendingAdjustments = (stepKey: string) => {
    const key = pendingAdjustments.has(stepKey) ? stepKey : '__nearest__';
    const count = pendingAdjustments.get(key) ?? 0;
    pendingAdjustments.delete(key);
    return count;
  };

  for (const event of uniqueEvents) {
    if (event.event_type === 'completed' || event.event_type === 'failed' || event.event_type === 'message_delta' || event.event_type === 'assistant_text_delta') continue;

    if (event.event_type === 'reasoning_summary_delta') {
      const segmentId = event.payload.segment_id;
      const stage = event.payload.stage;
      const sequence = event.payload.sequence;
      const delta = explicitDisplayDelta(event);
      if (typeof segmentId !== 'string' || !Number.isInteger(sequence) || Number(sequence) < 1 || !delta) continue;
      const existing = reasoningBySegment.get(segmentId);
      const parts = existing?.parts ?? new Map<number, string>();
      if (!parts.has(Number(sequence))) parts.set(Number(sequence), delta);
      let latest: string | null = null;
      for (let current = 1; parts.has(current); current += 1) latest = parts.get(current) ?? latest;
      const semanticStage = typeof stage === 'string' ? stage : existing?.stage ?? '';
      reasoningBySegment.set(segmentId, { stage: semanticStage, parts });
      if (!latest) continue;
      // `intake` carries the headline, `analysis` the supporting line. These are
      // the only two of the contract's five stages the column renders; the rest
      // are orchestration facts, not presentation.
      if (semanticStage === 'intake') reasoningTitle = latest;
      else if (semanticStage === 'analysis') reasoningBody = latest;
      continue;
    }

    if (event.event_type === 'repair_attempt' || event.event_type === 'retry_attempt') {
      const owningIndex = event.step_id
        ? toolsByStep.get(event.step_id) ?? -1
        : rows.findLastIndex((row) => row.kind === 'tool');
      if (owningIndex >= 0 && rows[owningIndex]) {
        rows[owningIndex] = {
          ...rows[owningIndex]!,
          adjustmentCount: rows[owningIndex]!.adjustmentCount + 1,
          sourceCursor: event.cursor,
        };
      } else {
        pendingAdjustments.set(event.step_id ?? '__nearest__', (pendingAdjustments.get(event.step_id ?? '__nearest__') ?? 0) + 1);
      }
      continue;
    }

    const stepKey = event.step_id ?? event.event_id;
    if (
      (event.event_type === 'tool_started' || event.event_type === 'tool_result')
      && event.payload.tool_name === 'scenario.capabilities.list'
    ) {
      replyKind = 'capability';
    }
    if (event.event_type === 'tool_started') {
      completeActiveRows(rows);
      toolsByStep.set(stepKey, rows.length);
      rows.push({
        id: stepKey,
        kind: 'tool',
        title: toolCopy(event).active,
        detail: payloadText(event, 'display_detail'),
        state: 'active',
        count: 1,
        adjustmentCount: takePendingAdjustments(stepKey),
        sourceCursor: event.cursor,
      });
      continue;
    }

    if (event.event_type === 'tool_result') {
      const pairedIndex = event.step_id
        ? toolsByStep.get(event.step_id) ?? -1
        : rows.findLastIndex((row) => row.kind === 'tool' && row.state === 'active');
      if (pairedIndex >= 0) {
        const copy = toolCopy(event, rows[pairedIndex]!.title);
        const failed = resultFailed(event);
        rows[pairedIndex] = {
          ...rows[pairedIndex],
          title: failed ? copy.failed : copy.complete,
          detail: displaySummary(event),
          state: failed ? 'failed' : 'complete',
          sourceCursor: event.cursor,
        };
        continue;
      }
      const copy = toolCopy(event);
      const failed = resultFailed(event);
      toolsByStep.set(stepKey, rows.length);
      rows.push({
        id: stepKey,
        kind: 'tool',
        title: failed ? copy.failed : copy.complete,
        detail: displaySummary(event),
        state: failed ? 'failed' : 'complete',
        count: 1,
        adjustmentCount: takePendingAdjustments(stepKey),
        sourceCursor: event.cursor,
      });
      continue;
    }

    if (event.event_type === 'interrupt_required') {
      completeActiveRows(rows);
      rows.push({
        id: event.event_id,
        kind: 'waiting',
        title: 'Cần thêm thông tin để tiếp tục',
        detail: null,
        state: 'complete',
        count: 1,
        adjustmentCount: 0,
        sourceCursor: event.cursor,
      });
      continue;
    }

    if (event.event_type === 'interrupt_resolved' || event.event_type === 'resumed') {
      const waitingIndex = rows.findLastIndex((row) => row.kind === 'waiting');
      if (waitingIndex >= 0) rows.splice(waitingIndex, 1);
      continue;
    }

    // Plan/verification lifecycle remains durable evidence, not user-facing
    // prose. Graph stages must never be turned into a fake checklist.
  }

  if (terminal !== 'running') completeActiveRows(rows);

  const reasoning = reasoningTitle || reasoningBody
    ? { title: reasoningTitle || 'Đang xử lý yêu cầu', body: reasoningBody }
    : null;
  return { rows, reasoning, terminal, finalText: finalText(uniqueEvents, terminal), replyKind };
}
