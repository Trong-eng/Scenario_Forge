export type AgentReasoningStage = 'intake' | 'analysis' | 'planning' | 'execution' | 'verification';

export type ReasoningSummaryDeltaPayload = {
  segment_id: string;
  stage: AgentReasoningStage;
  sequence: number;
  delta: string;
};

export type AssistantTextDeltaPayload = {
  message_id: string;
  sequence: number;
  delta: string;
};

export type AgentEventType = 'plan_created' | 'plan_updated' | 'tool_started' | 'tool_result' | 'job_waiting' | 'interrupt_required' | 'repair_attempt' | 'retry_attempt' | 'verification' | 'message_delta' | 'reasoning_summary_delta' | 'assistant_text_delta' | 'interrupt_resolved' | 'resumed' | 'completed' | 'failed';

export type AgentInterruptDecision = 'approve' | 'reject' | 'answer';

export type AgentClarificationChoice = {
  ordinal: number;
  value: string;
  label: string;
};

export type AgentClarificationPending = {
  field: string;
  prompt: string;
  choices: readonly AgentClarificationChoice[];
  allows_other: boolean;
  subject?: string;
  actor_ref?: string;
};

export type AgentPendingInterrupt = {
  interrupt_id: string;
  thread_id: string;
  kind: 'clarification' | 'approval' | 'run';
  reason: string;
  allowed_decisions: readonly AgentInterruptDecision[];
  target_hash: string;
  target_params_hash: string;
  display_summary: string;
  created_at: string;
  correlation_id: string;
  clarification?: AgentClarificationPending | null;
};

export type AgentInterruptDecisionResponse = {
  status: 'resolved' | 'resuming';
  interrupt_id: string;
  message_id: string | null;
  resumed: true;
  correlation_id: string;
};

export type AgentThread = {
  thread_id: string;
  project_id: string;
  status: string;
  title: string;
  summary: string;
  turn_count: number;
  created_at: string;
  updated_at: string;
  correlation_id: string;
};

export type AgentThreadPage = {
  items: AgentThread[];
  next_cursor: string | null;
  correlation_id: string;
};

export type AgentBudgetProgress = {
  session_id: string;
  status: string;
  model_calls_used: number;
  model_call_limit: number | null;
  remaining_model_calls: number | null;
  backend_active_elapsed_ms: number;
  backend_active_limit_ms: number;
  question_response_elapsed_ms: number;
  question_response_limit_ms: number;
  blocking_questions_used: number;
  blocking_question_limit: number;
  answers_stored: number;
  answer_storage_limit: number;
  retry_generation: number;
  terminal_code: string | null;
  correlation_id: string;
};

export type AgentTranscriptMessage = {
  message_id: string;
  role: 'user';
  safe_summary: string;
  created_at: string;
};

export type AgentTranscriptPage = {
  items: AgentTranscriptMessage[];
  correlation_id: string;
};

export type AgentEvent = {
  event_id: string;
  cursor: number;
  event_type: AgentEventType;
  thread_id: string;
  step_id: string | null;
  correlation_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type AgentRecoveryAction = 'clarify' | 'confirm' | 'retry' | 'start_new';

export type AgentRecoveryProjection = {
  message: string;
  action: AgentRecoveryAction;
  actions?: AgentRecoveryAction[];
  unresolvedFields?: string[];
  field?: string;
  subject?: string;
};

/**
 * ADR-0008 presentation-only frame. Deliberately has no `cursor`: it is never
 * persisted and a client must never resume from it. It builds an in-memory
 * draft that the durable event for the same `message_id` / `segment_id`
 * *replaces* — never appends to.
 */
export type AgentEphemeralFrame = {
  event_id: string;
  event_type: 'reasoning_summary_delta' | 'assistant_text_delta';
  thread_id: string;
  step_id?: string | null;
  correlation_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  ephemeral: true;
};

/**
 * In-memory draft assembled from ephemeral frames for the turn in flight.
 *
 * Held apart from `events` on purpose. An ephemeral and a durable delta share
 * the same `message_id` / `segment_id` but number their sequences differently
 * (the durable reply is one part; the draft is many), so folding them into one
 * map would interleave two orderings. Keeping them apart makes the reconcile
 * rule trivial and total: durable text, when present, *replaces* the draft.
 */
export type AgentEphemeralDraft = {
  /** message_id -> sequence -> delta */
  assistant: Record<string, Record<number, string>>;
  /** segment_id, in the order the segments first appeared */
  reasoningOrder: string[];
  reasoning: Record<string, { stage: string; parts: Record<number, string> }>;
};

export const emptyEphemeralDraft: AgentEphemeralDraft = { assistant: {}, reasoningOrder: [], reasoning: {} };

/** Presentation-only guard: a runaway turn must not grow browser memory without bound. */
const MAX_DRAFT_PARTS = 4096;

export function reduceEphemeralDraft(draft: AgentEphemeralDraft, frame: AgentEphemeralFrame): AgentEphemeralDraft {
  const sequence = frame.payload.sequence;
  const delta = frame.payload.delta;
  if (typeof delta !== 'string' || !Number.isInteger(sequence) || Number(sequence) < 1) return draft;
  const index = Number(sequence);

  if (frame.event_type === 'assistant_text_delta') {
    const messageId = frame.payload.message_id;
    if (typeof messageId !== 'string' || !messageId) return draft;
    const parts = draft.assistant[messageId] ?? {};
    if (parts[index] !== undefined || Object.keys(parts).length >= MAX_DRAFT_PARTS) return draft;
    return { ...draft, assistant: { ...draft.assistant, [messageId]: { ...parts, [index]: delta } } };
  }

  const segmentId = frame.payload.segment_id;
  if (typeof segmentId !== 'string' || !segmentId) return draft;
  const stage = typeof frame.payload.stage === 'string' ? frame.payload.stage : '';
  const existing = draft.reasoning[segmentId];
  const parts = existing?.parts ?? {};
  if (parts[index] !== undefined || Object.keys(parts).length >= MAX_DRAFT_PARTS) return draft;
  return {
    ...draft,
    reasoningOrder: existing ? draft.reasoningOrder : [...draft.reasoningOrder, segmentId],
    reasoning: { ...draft.reasoning, [segmentId]: { stage: existing?.stage ?? stage, parts: { ...parts, [index]: delta } } },
  };
}

export type AgentThreadState = {
  thread: AgentThread | null;
  events: AgentEvent[];
  cursor: number;
  pendingInterrupt: AgentPendingInterrupt | null;
  completed: boolean;
  failed: boolean;
  ephemeral: AgentEphemeralDraft;
};

export const initialAgentThreadState: AgentThreadState = { thread: null, events: [], cursor: 0, pendingInterrupt: null, completed: false, failed: false, ephemeral: emptyEphemeralDraft };

export function reduceAgentThread(state: AgentThreadState, event: AgentEvent): AgentThreadState {
  if (event.cursor <= state.cursor) return state;
  // A durable thread may contain many turns. Any event after a terminal marker
  // belongs to a fresh active turn until that turn emits its own terminal event.
  const next = {
    ...state,
    events: [...state.events, event],
    cursor: event.cursor,
    completed: false,
    failed: false,
  };
  if (event.event_type === 'interrupt_required') return { ...next, pendingInterrupt: null };
  if (event.event_type === 'interrupt_resolved' || event.event_type === 'resumed') {
    const resolvedId = typeof event.payload.interrupt_id === 'string' ? event.payload.interrupt_id : null;
    return resolvedId && state.pendingInterrupt?.interrupt_id === resolvedId
      ? { ...next, pendingInterrupt: null }
      : next;
  }
  // The durable full text has already landed by now, so dropping the draft is
  // the swap itself — and it keeps the next turn from inheriting this one.
  if (event.event_type === 'completed') return { ...next, completed: true, pendingInterrupt: null, ephemeral: emptyEphemeralDraft };
  if (event.event_type === 'failed') return { ...next, failed: true, pendingInterrupt: null, ephemeral: emptyEphemeralDraft };
  return next;
}
