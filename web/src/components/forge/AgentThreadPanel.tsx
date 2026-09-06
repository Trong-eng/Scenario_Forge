'use client';

import { FormEvent, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, LoaderCircle, Plus, Send, ShieldCheck, Square } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ApiError, apiClient, type ProviderRequestContext } from '@/shared/api/client';
import { emptyEphemeralDraft, type AgentBudgetProgress, type AgentClarificationPending, type AgentEvent, type AgentPendingInterrupt, type AgentRecoveryAction, type AgentRecoveryProjection, type AgentThread, type AgentTranscriptMessage } from '@/shared/api/agentTypes';
import { BrandMark } from '@/shared/components/BrandMark';
import type { LiveSession } from './liveTypes';
import { AgentActivityStream } from './AgentActivityStream';
import { AgentClarificationCard } from './AgentClarificationCard';
import { projectClarificationExchanges } from './clarificationExchange';
import { useAgentThread } from './useAgentThread';
import { useConversationAutoFollow } from './useConversationAutoFollow';
import { clarificationValueLabel } from './clarificationLabels';
import { useLocaleFormat, type MessageKey, type Translate } from '@/shared/i18n';
import type { Language } from '@/shared/preferences/types';
import { CanvasArtifactCard } from './CanvasArtifactCard';
import type { CanvasStep } from './workspaceCanvasModel';
import type { ActiveThreadDefinitionReference } from './useLiveWorkspace';

const PROJECTION_INCOMPLETE_CODE = 'AGENT_DECISION_PROJECTION_INCOMPLETE';
const MAX_PROJECTION_RECOVERY_ATTEMPTS = 3;

function isRetryableProjectionIncomplete(error: unknown): boolean {
  return error instanceof ApiError
    && error.envelope.code === PROJECTION_INCOMPLETE_CODE
    && error.envelope.retryable === true;
}

function isFailClosedDecisionError(error: unknown): boolean {
  return error instanceof ApiError && !isRetryableProjectionIncomplete(error);
}

const starterKeys: MessageKey[] = ['agent.sample.pedestrian', 'agent.sample.cutIn', 'agent.sample.brake'];

// Every framed control in the chat surface follows this rail. Keeping the
// measure here (rather than inside individual cards) prevents late-arriving
// artifacts, gates and composer states from jumping to a different axis.
const AGENT_CONTENT_RAIL_CLASS = 'mx-auto w-full max-w-[42rem]';

type UserTurn = {
  id: string;
  text: string;
  createdAt: string;
  /**
   * Ledger cursor at the moment this message was sent. Everything after it
   * belongs to this exchange. A turn parked on an interrupt emits no terminal
   * event, so terminal-splitting alone cannot tell where one exchange ends and
   * the next begins; the cursor can, and it is immune to clock skew between the
   * browser and the server. Absent for turns restored from a transcript.
   */
  startCursor?: number;
};
type OptimisticClarification = { interruptId: string; field: string; prompt: string; answer: string };
type ClarificationHistory = { interruptId: string; field: string; prompt: string; answer: string };

const UserTurnBubble = memo(function UserTurnBubble({ turn }: { turn: UserTurn }) {
  // Alignment, not a saturated fill, distinguishes the operator from the
  // agent. This keeps long transcript reads quiet while preserving the brand
  // color for decisions and the send affordance.
  return <article aria-label="User message" className="ml-auto max-w-[85%] rounded-2xl border border-border bg-card px-4 py-2.5 text-[length:calc(13px*var(--font-scale))] leading-relaxed text-foreground shadow-[0_1px_2px_rgba(43,31,24,0.04)]">
    {turn.text}
  </article>;
});

const ClarificationAnswerLine = memo(function ClarificationAnswerLine({ field, answer, t, language }: { field: string; answer: string; t: Translate; language: Language }) {
  return <p
    data-clarification-connector="true"
    className="agent-text-secondary ml-[7px] border-l border-border/80 py-0.5 pl-3 text-[length:calc(13px*var(--font-scale))] leading-[1.65]"
  >
    <span className="agent-text-primary font-medium">{t('agent.added')}</span>{' '}
    {localizedClarificationField(field, t)} — <span className="agent-text-primary">{clarificationValueLabel(field, answer, language)}</span>
  </p>;
});

const ClarificationHistoryItem = memo(function ClarificationHistoryItem({ item, t, language }: { item: ClarificationHistory; t: Translate; language: Language }) {
  return <article aria-label="Agent clarification answer" className="w-full">
    <p className="agent-text-primary max-w-[48rem] text-[length:calc(15px*var(--font-scale))] leading-[1.7]">{item.prompt}</p>
    <div className="mt-1.5"><ClarificationAnswerLine field={item.field} answer={item.answer} t={t} language={language} /></div>
  </article>;
});

const SENSITIVE_COPY = /(?:sha256:|[a-f0-9]{32,}|sk-[a-z0-9]+|decision_token|private-capability|\bthinking\b|action_key|author_definition|plan-[a-z0-9_-]+|interrupt-[a-z0-9_-]+|corr-[a-z0-9_-]+|step-hidden|worker_resume_key)/i;
const VIETNAMESE_COPY = /(?:[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]|\b(?:đã|đang|cần|chưa|không|bạn|và|yêu cầu|kết quả|hoàn tất|sẵn sàng|xử lý|kiểm tra|tạo|dựng|tìm thấy)\b)/iu;

/** Returns text to show, not a key: a server envelope carries its own message,
 *  and only the two fallbacks are ours to translate.
 */
function safeError(error: unknown, t: Translate) {
  if (error instanceof ApiError) {
    // Transport-level fallbacks are internal diagnostics, not operator copy.
    if (error.envelope.code === 'ERR_INVALID_ERROR_RESPONSE') {
      return t('agent.invalidResponse');
    }
    return error.envelope.message;
  }
  return t('agent.sendFailed');
}

function humanPayloadText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || SENSITIVE_COPY.test(text)) return null;
  return text;
}

function recoveryFromEvents(events: readonly AgentEvent[]): AgentRecoveryProjection | null {
  const verification = [...events].reverse().find((item) => item.event_type === 'verification');
  const candidate = verification?.payload.recovery;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  const message = humanPayloadText(record.message);
  const action = record.action;
  if (!message || !['clarify', 'confirm', 'retry', 'start_new'].includes(String(action))) return null;
  const actions = Array.isArray(record.actions)
    ? record.actions.filter((item): item is AgentRecoveryAction => ['clarify', 'confirm', 'retry', 'start_new'].includes(String(item)))
    : [];
  const projection: AgentRecoveryProjection = {
    message: message.slice(0, 512),
    action: action as AgentRecoveryAction,
    actions: actions.length ? actions : undefined,
  };
  if (Array.isArray(record.unresolved_fields)) {
    const fields = record.unresolved_fields.filter((item): item is string => typeof item === 'string' && /^[A-Za-z][A-Za-z0-9_]*(?: \([A-Za-z][A-Za-z0-9_-]*\))?$/.test(item));
    if (fields.length) projection.unresolvedFields = fields.slice(0, 32);
  }
  if (typeof record.field === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(record.field)) projection.field = record.field;
  if (typeof record.subject === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(record.subject)) projection.subject = record.subject;
  return projection;
}

const RecoveryAction = memo(function RecoveryAction({ projection, onRetry, onStartNew, onClarify, t }: {
  projection: AgentRecoveryProjection;
  onRetry: () => void;
  onStartNew: () => void;
  onClarify: () => void;
  t: Translate;
}) {
  const labels: Record<AgentRecoveryAction, string> = {
    clarify: t('agent.decision.clarify'),
    confirm: t('agent.decision.confirm'),
    retry: t('agent.decision.retry'),
    start_new: t('agent.decision.startNew'),
  };
  const actions = projection.actions?.length ? projection.actions : [projection.action];
  const handlerFor = (action: AgentRecoveryAction) => action === 'retry' ? onRetry : action === 'start_new' ? onStartNew : onClarify;
  return <div role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-[length:calc(13px*var(--font-scale))]">
    <div className="min-w-0 flex-1 leading-relaxed">
      <p>{projection.message}</p>
      {projection.unresolvedFields?.length ? <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {projection.unresolvedFields.map((field) => <li key={field}>{field}</li>)}
      </ul> : null}
    </div>
    {actions.map((action) => <button key={action} type="button" onClick={handlerFor(action)} className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-[length:calc(12px*var(--font-scale))] font-semibold text-foreground first:bg-primary first:text-primary-foreground">{labels[action]}</button>)}
  </div>;
});

function clarificationPromptKey(field: string): MessageKey {
  switch (field) {
    case 'map': return 'agent.ask.map';
    case 'weather': return 'agent.ask.weather';
    case 'time_of_day': return 'agent.ask.timeOfDay';
    case 'ego_speed':
    case 'speed': return 'agent.ask.speed';
    case 'gap':
    case 'distance': return 'agent.ask.distance';
    case 'duration':
    case 'scenario_duration':
    case 'simulation_duration': return 'agent.ask.duration';
    case 'location': return 'agent.ask.location';
    default: return 'agent.ask.default';
  }
}

/** The provider may send its own prose. When it does and it is already written
 *  for a person, it wins: it is more specific than anything this table knows.
 */
function localizedClarificationPrompt(clarification: AgentClarificationPending, t: Translate) {
  const safePrompt = humanPayloadText(clarification.prompt);
  if (safePrompt && VIETNAMESE_COPY.test(safePrompt)) return safePrompt;
  return t(clarificationPromptKey(clarification.field));
}

function clarificationFieldKey(field: string): MessageKey | null {
  switch (field) {
    case 'map': return 'field.map';
    case 'weather': return 'field.weather';
    case 'time_of_day': return 'field.timeOfDay';
    case 'ego_speed':
    case 'speed': return 'field.speed';
    case 'gap':
    case 'distance': return 'field.distance';
    case 'duration':
    case 'scenario_duration':
    case 'simulation_duration': return 'field.duration';
    case 'location': return 'field.location';
    default: return null;
  }
}

function localizedClarificationField(field: string, t: Translate) {
  const key = clarificationFieldKey(field);
  return key ? t(key) : field.replaceAll('_', ' ');
}

function localizedInterruptSummary(pending: AgentPendingInterrupt, t: Translate) {
  const safeSummary = humanPayloadText(pending.display_summary);
  if (safeSummary && VIETNAMESE_COPY.test(safeSummary)) return safeSummary;
  if (pending.kind === 'approval') return t('agent.pending.approval');
  if (pending.kind === 'run') return t('agent.pending.run');
  return t('agent.pending.default');
}

function agentCorrelationId(operation: string) {
  const normalized = operation.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 24);
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  return `web-agent-${normalized}-${suffix}`.slice(0, 64);
}

type AgentThreadPanelProps = {
  session: LiveSession;
  selectedThreadId?: string | null;
  selectedThreadTitle?: string | null;
  resetKey?: number;
  onThreadUpdated?: (thread: AgentThread) => void;
  onThreadSettled?: (outcome: 'completed' | 'failed' | 'cancelled') => void;
  onDefinitionPublished?: (reference: ActiveThreadDefinitionReference) => void;
  /** One bounded intent handed over from the Capabilities pane. */
  pendingIntent?: string | null;
  onPendingIntentConsumed?: () => void;
  onOpenCapabilities?: () => void;
  canvasArtifact?: {
    title: string;
    description: string;
    meta?: string;
    step: CanvasStep;
  };
  onOpenCanvas?: (step: CanvasStep) => void;
  /**
   * Workspace notes written by this session, not by the agent. Rendered apart
   * from the transcript so nothing the client composed can read as something
   * the agent said.
   */
  workspaceNotes?: readonly { id: string; text: string }[];
};

/**
 * A Definition publication belongs to the thread that produced its event
 * ledger. During a reset React can render one frame with the old ledger, so a
 * callback must be fenced before it hydrates provider lineage into a new
 * scenario.
 */
export function shouldAcceptPublishedDefinition(
  publishedThreadId: string | null,
  activeThreadId: string | null,
  resetPending = false,
) {
  return !resetPending && Boolean(publishedThreadId && activeThreadId && publishedThreadId === activeThreadId);
}

/** Project only successful authoring events, with an exact DefinitionVersion identity. */
export function definitionReferenceFromEvent(event: AgentEvent): ActiveThreadDefinitionReference | null {
  if (event.event_type !== 'tool_result') return null;
  if (event.payload.tool_name !== 'author_definition' || event.payload.status !== 'success') return null;
  const definitionId = event.payload.definition_id;
  if (typeof definitionId !== 'string' || !definitionId) return null;
  const versionValue = event.payload.definition_version ?? event.payload.version;
  const version = typeof versionValue === 'number' && Number.isInteger(versionValue) && versionValue >= 1
    ? versionValue
    : null;
  const refs = event.payload.domain_refs;
  const definitionVersionId = Array.isArray(refs) && typeof refs[0] === 'string' && refs[0] ? refs[0] : undefined;
  if (version === null && !definitionVersionId) return null;
  return { definitionId, version, ...(definitionVersionId ? { definitionVersionId } : {}) };
}

export const AgentThreadPanel = memo(function AgentThreadPanel({ session, selectedThreadId = null, selectedThreadTitle = null, resetKey = 0, onThreadUpdated, onThreadSettled, onDefinitionPublished, pendingIntent = null, onPendingIntentConsumed, onOpenCapabilities, canvasArtifact, onOpenCanvas, workspaceNotes = [] }: AgentThreadPanelProps) {
  const { t, language } = useLocaleFormat();
  const { state, setThread, setPendingInterrupt, refreshPending, reset, connect, disconnect, connected, streamError: rawStreamError } = useAgentThread();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [projectionRetryAvailable, setProjectionRetryAvailable] = useState(false);
  const [answer, setAnswer] = useState('');
  const [otherSelected, setOtherSelected] = useState(false);
  const [userTurns, setUserTurns] = useState<UserTurn[]>([]);
  const [optimisticClarifications, setOptimisticClarifications] = useState<OptimisticClarification[]>([]);
  const [activitySettled, setActivitySettled] = useState(false);
  const [awaitingFirstEvent, setAwaitingFirstEvent] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [turnActive, setTurnActive] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [turnStartedAtMs, setTurnStartedAtMs] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [budgetProgress, setBudgetProgress] = useState<AgentBudgetProgress | null>(null);
  const lastDecisionRef = useRef<'approve' | 'reject' | 'answer' | null>(null);
  const lastAnswerRef = useRef<string>('');
  const lastInterruptRef = useRef<string | null>(null);
  const commandKeys = useRef(new Map<string, string>());
  const connectRef = useRef(connect);
  const publishedDefinitionRef = useRef<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const publicationResetPendingRef = useRef(false);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const publishedDefinition = useMemo(() => {
    for (let index = state.events.length - 1; index >= 0; index -= 1) {
      const candidate = state.events[index];
      const reference = candidate ? definitionReferenceFromEvent(candidate) : null;
      if (reference) return reference;
    }
    return undefined;
  }, [state.events]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  const context = useCallback((operation: string, identity: string, idempotent = false): ProviderRequestContext => {
    const commandIdentity = `${session.projectId}:${operation}:${identity}`;
    if (idempotent && !commandKeys.current.has(commandIdentity)) commandKeys.current.set(commandIdentity, `web-agent-${operation}-${crypto.randomUUID()}`);
    return { ...session, correlationId: agentCorrelationId(operation), ...(idempotent ? { idempotencyKey: commandKeys.current.get(commandIdentity) } : {}) };
  }, [session]);

  const clearLocalView = useCallback(() => {
    commandKeys.current.clear();
    publishedDefinitionRef.current = null;
    lastDecisionRef.current = null;
    lastAnswerRef.current = '';
    lastInterruptRef.current = null;
    setUserTurns([]);
    setOptimisticClarifications([]);
    setAnswer('');
    setOtherSelected(false);
    setActivitySettled(false);
    setAwaitingFirstEvent(false);
    setTurnActive(false);
    setStopRequested(false);
    setTurnStartedAtMs(null);
    setRequestError(null);
    setBudgetProgress(null);
    setSubmitting(false);
    setDecisionSubmitting(false);
    setRecovering(false);
    setProjectionRetryAvailable(false);
  }, []);

  useEffect(() => {
    activeThreadIdRef.current = null;
    disconnect();
    reset();
    clearLocalView();
    return () => disconnect();
  }, [clearLocalView, disconnect, reset, session.projectId]);

  const refreshBudgetProgress = useCallback(async (threadId: string) => {
    try {
      const progress = await apiClient.getAgentBudgetProgress(threadId, context('budget-progress', threadId));
      if (activeThreadIdRef.current === threadId) setBudgetProgress(progress);
    } catch {
      // Budget display is informative; agent execution remains authoritative.
    }
  }, [context]);

  useEffect(() => {
    const threadId = state.thread?.thread_id ?? selectedThreadId;
    if (threadId) void refreshBudgetProgress(threadId);
  }, [refreshBudgetProgress, selectedThreadId, state.thread?.thread_id]);

  useEffect(() => {
    if (resetKey === 0) return;
    publicationResetPendingRef.current = true;
    activeThreadIdRef.current = null;
    disconnect();
    reset();
    clearLocalView();
  }, [clearLocalView, disconnect, reset, resetKey, session.projectId]);

  // The parent index only selects IDs returned by the server. Restore the safe
  // transcript and replay the canonical event ledger from cursor zero.
  useEffect(() => {
    if (!selectedThreadId || activeThreadIdRef.current === selectedThreadId) return;
    let cancelled = false;
    activeThreadIdRef.current = selectedThreadId;
    disconnect();
    reset();
    clearLocalView();
    void Promise.all([
      apiClient.getAgentThread(selectedThreadId, context('restore-thread', selectedThreadId)),
      apiClient.getAgentTranscript(selectedThreadId, context('restore-transcript', selectedThreadId)),
    ]).then(([thread, transcript]) => {
      if (cancelled || activeThreadIdRef.current !== selectedThreadId) return;
      setUserTurns(transcript.items.map((item) => ({ id: item.message_id, text: item.safe_summary, createdAt: item.created_at })));
      setThread(thread);
      connectRef.current(thread.thread_id, context('restore-events', thread.thread_id), 0);
    }).catch((error) => {
      if (cancelled || activeThreadIdRef.current !== selectedThreadId) return;
      setRequestError(safeError(error, t));
    });
    return () => { cancelled = true; };
  }, [clearLocalView, context, disconnect, reset, selectedThreadId, setThread]);

  useEffect(() => {
    if (!publishedDefinition) return;
    const publicationKey = `${publishedDefinition.definitionId}:${publishedDefinition.version ?? publishedDefinition.definitionVersionId ?? ''}`;
    if (publicationKey === publishedDefinitionRef.current) return;
    const publicationResetPending = publicationResetPendingRef.current;
    publicationResetPendingRef.current = false;
    if (!shouldAcceptPublishedDefinition(state.thread?.thread_id ?? null, activeThreadIdRef.current, publicationResetPending)) return;
    publishedDefinitionRef.current = publicationKey;
    onDefinitionPublished?.(publishedDefinition);
  }, [onDefinitionPublished, publishedDefinition, state.thread?.thread_id]);

  const lastEvent = state.events.at(-1);
  const lastEventId = lastEvent?.event_id;
  const terminal = lastEvent?.event_type === 'completed' || lastEvent?.event_type === 'failed';

  useEffect(() => {
    if (!lastEvent) return;
    setAwaitingFirstEvent(false);
  }, [lastEvent, lastEventId]);

  useEffect(() => {
    setOtherSelected(false);
  }, [state.pendingInterrupt?.interrupt_id]);

  useEffect(() => {
    if (terminal) onThreadSettled?.(lastEvent?.event_type === 'failed' ? 'failed' : 'completed');
    if (terminal && state.thread?.thread_id) void refreshBudgetProgress(state.thread.thread_id);
  }, [lastEvent?.event_id, lastEvent?.event_type, onThreadSettled, refreshBudgetProgress, state.thread?.thread_id, terminal]);

  useEffect(() => {
    const decidedInterrupt = lastInterruptRef.current;
    const resolvedByEvent = Boolean(decidedInterrupt && state.events.some((item) => (
      (item.event_type === 'interrupt_resolved' || item.event_type === 'resumed')
      && item.payload.interrupt_id === decidedInterrupt
    )));
    const nextInterrupt = Boolean(
      decidedInterrupt
      && state.pendingInterrupt
      && state.pendingInterrupt.interrupt_id !== decidedInterrupt,
    );
    const durableDeliveryAdvanced = terminal || resolvedByEvent || nextInterrupt;
    if (!durableDeliveryAdvanced || projectionRetryAvailable) return;
    lastInterruptRef.current = null;
    setRequestError(null);
    setRecovering(false);
  }, [projectionRetryAvailable, state.events, state.pendingInterrupt, terminal]);

  const sendText = useCallback(async (text: string, freshThread = false) => {
    if (!text || submitting || state.pendingInterrupt) return;
    if (freshThread) {
      activeThreadIdRef.current = null;
      disconnect();
      reset();
      clearLocalView();
    }
    setUserTurns((current) => [...current, { id: `user-${crypto.randomUUID()}`, text, createdAt: new Date().toISOString(), startCursor: state.cursor }]);
    setMessage('');
    setSubmitting(true);
    setActivitySettled(false);
    setTurnActive(true);
    setStopRequested(false);
    setTurnStartedAtMs(Date.now());
    setAwaitingFirstEvent(true);
    setRequestError(null);
    try {
      const thread = state.thread && !freshThread
        ? await apiClient.appendAgentMessage(state.thread.thread_id, text, context('message', `${state.thread.thread_id}:${text}`, true))
        : await apiClient.createAgentThread(text, context('thread', text, true));
      activeThreadIdRef.current = thread.thread_id;
      setThread(thread);
      onThreadUpdated?.(thread);
      connectRef.current(thread.thread_id, context('events', thread.thread_id));
    } catch (error) {
      // The turn never reached the ledger, so nothing is running: release the
      // optimistic running state here or the composer parks on a stop button
      // forever (live-deployment finding L2).
      setAwaitingFirstEvent(false);
      setTurnActive(false);
      setStopRequested(false);
      setRequestError(safeError(error, t));
    } finally {
      setSubmitting(false);
    }
  }, [clearLocalView, context, disconnect, onThreadUpdated, reset, setThread, state.cursor, state.pendingInterrupt, state.thread, submitting]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await sendText(message.trim());
  };

  // The ledger is append-only, so preserve the old attempt in Recent and start
  // a clean thread for regeneration. Reusing this thread would stack duplicate
  // user/assistant turns and make the retry look like a follow-up message.
  const retryLastTurn = useCallback(() => {
    // Re-ask in the SAME thread, as a new turn — exactly what typing the
    // question again would do.
    //
    // It used to suppress the second bubble, meaning to replace the answer the
    // way ChatGPT replaces a regenerated one. The ledger is append-only, so
    // nothing was replaced: the retried answer simply landed under the original
    // question next to the first one, and a thread of retries read as one
    // question with a pile of answers stuck to it.
    const text = userTurns.at(-1)?.text;
    if (text) void sendText(text);
  }, [sendText, userTurns]);

  const stopTurn = async () => {
    const threadId = state.thread?.thread_id ?? activeThreadIdRef.current;
    if (!threadId || stopping || stopRequested) return;
    setStopping(true);
    setRequestError(null);
    // Stop pacing immediately. This only finishes revealing text that already
    // arrived — it claims nothing about the turn — and the operator asked for
    // it to stop now, not after a round trip (spec 6.3).
    setStopRequested(true);
    try {
      await apiClient.cancelAgentTurn(threadId, context('cancel', threadId, true));
    } catch (error) {
      // `AGENT_TURN_NOT_RUNNING` means there was nothing left to stop — the turn
      // had already finished. That is the outcome the operator asked for, so it
      // is not an error to shout about; showing the raw envelope text put an
      // English internal message on screen.
      if (error instanceof ApiError && error.envelope.code === 'AGENT_TURN_NOT_RUNNING') {
        setTurnActive(false);
      } else {
        // The turn really is still running. Saying otherwise would misreport
        // system state, so pacing resumes and the composer returns to its
        // running form.
        setStopRequested(false);
        setRequestError(safeError(error, t));
      }
    } finally {
      setStopping(false);
    }
  };

  const decide = async (decision: 'approve' | 'reject' | 'answer', explicitAnswer?: string) => {
    const pending = state.pendingInterrupt;
    const thread = state.thread;
    const clarification = pending?.kind === 'clarification' ? pending.clarification : null;
    const safeAnswer = (explicitAnswer ?? answer).trim();
    if (!pending || !thread || decisionSubmitting || !pending.allowed_decisions.includes(decision) || (decision === 'answer' && !safeAnswer)) return;
    lastDecisionRef.current = decision;
    lastAnswerRef.current = decision === 'answer' ? safeAnswer : '';
    lastInterruptRef.current = pending.interrupt_id;
    if (decision === 'answer' && !recovering && !projectionRetryAvailable) {
      const matched = clarification?.choices.find((item) => String(item.ordinal) === safeAnswer);
      if (clarification) {
        setOptimisticClarifications((current) => [
          ...current.filter((item) => item.interruptId !== pending.interrupt_id),
          {
            interruptId: pending.interrupt_id,
            field: clarification.field,
            prompt: localizedClarificationPrompt(clarification, t),
            answer: matched?.label ?? safeAnswer,
          },
        ]);
      }
      setAnswer('');
      setOtherSelected(false);
    }
    setDecisionSubmitting(true);
    setRecovering(true);
    setTurnStartedAtMs(Date.now());
    setAwaitingFirstEvent(true);
    setProjectionRetryAvailable(false);
    setRequestError(null);
    let lastError: unknown = null;
    let attemptsUsed = 0;
    let keepReconciling = false;
    try {
      for (let attempt = 0; attempt < MAX_PROJECTION_RECOVERY_ATTEMPTS; attempt += 1) {
        attemptsUsed = attempt + 1;
        try {
          await apiClient.decideAgentInterrupt(thread.thread_id, pending.interrupt_id, decision, context('interrupt', pending.interrupt_id), decision === 'answer' ? safeAnswer : undefined);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (!isRetryableProjectionIncomplete(error) || attempt === MAX_PROJECTION_RECOVERY_ATTEMPTS - 1) {
            break;
          }
        }
      }
      if (lastError) throw lastError;
      setAnswer('');
      setOtherSelected(false);
      setProjectionRetryAvailable(false);
      if (attemptsUsed > 1) {
        connectRef.current(thread.thread_id, context('events-recover', thread.thread_id));
      }
      const nextPending = await refreshPending(
        thread.thread_id,
        context('pending-after-decision', pending.interrupt_id),
      );
      setPendingInterrupt(nextPending);
    } catch (error) {
      setAwaitingFirstEvent(false);
      if (isFailClosedDecisionError(error) || isRetryableProjectionIncomplete(error)) {
        setRequestError(safeError(error, t));
        if (isRetryableProjectionIncomplete(error)) setProjectionRetryAvailable(true);
        if (isFailClosedDecisionError(error)) {
          setOptimisticClarifications((current) => current.filter((item) => item.interruptId !== pending.interrupt_id));
        }
      } else {
        keepReconciling = true;
      }
    } finally {
      setDecisionSubmitting(false);
      if (!keepReconciling) setRecovering(false);
    }
  };

  const pending = state.pendingInterrupt;
  const clarification = pending?.kind === 'clarification' ? pending.clarification ?? null : null;
  const transcript: AgentTranscriptMessage[] = useMemo(() => userTurns.map((turn) => ({
    message_id: turn.id,
    role: 'user',
    safe_summary: turn.text,
    created_at: turn.createdAt,
  })), [userTurns]);
  const clarificationProjection = useMemo(
    () => projectClarificationExchanges(state.events, transcript),
    [state.events, transcript],
  );
  const visibleUserTurns = useMemo(
    () => userTurns.filter((turn) => !clarificationProjection.consumedMessageIds.has(turn.id)),
    [clarificationProjection.consumedMessageIds, userTurns],
  );
  const clarificationHistory: ClarificationHistory[] = useMemo(() => {
    const optimisticById = new Map(optimisticClarifications.map((item) => [item.interruptId, item]));
    const durableIds = new Set(clarificationProjection.exchanges.filter((item) => item.resolved).map((item) => item.interruptId));
    return [
      ...clarificationProjection.exchanges.filter((item) => item.resolved).map((item) => ({
        interruptId: item.interruptId,
        field: item.field,
        prompt: localizedClarificationPrompt({ field: item.field, prompt: item.prompt, choices: item.choices, allows_other: true }, t),
        answer: optimisticById.get(item.interruptId)?.answer ?? item.answer ?? t('agent.answerRecorded'),
      })),
      ...optimisticClarifications.filter((item) => !durableIds.has(item.interruptId)),
    ];
  }, [clarificationProjection.exchanges, optimisticClarifications]);
  const currentOptimisticClarification = pending
    ? optimisticClarifications.find((item) => item.interruptId === pending.interrupt_id) ?? null
    : null;
  const composerLocked = submitting || recovering || projectionRetryAvailable || decisionSubmitting || Boolean(pending);

  // Capabilities-pane handoff: park the bounded intent into the composer only
  // when the thread is idle, then report consumption exactly once.
  useEffect(() => {
    if (!pendingIntent) return;
    if (composerLocked || turnActive) return;
    // The operator just asked for this capability, so it replaces an idle
    // draft rather than being silently dropped.
    setMessage(pendingIntent);
    onPendingIntentConsumed?.();
    window.setTimeout(() => messageInputRef.current?.focus(), 16);
  }, [pendingIntent, composerLocked, turnActive, onPendingIntentConsumed]);
  // `submitting` is excluded so the POST still shows its own spinner; the stop
  // control appears once there is a turn on the server that can receive it.
  // Also offered while the thread is parked on a question. The graph is not
  // executing then, but `append_message` refuses while an interrupt is pending,
  // so without a way out the operator is stuck on a question they do not want to
  // answer. The cancel route abandons the interrupt and ends the turn.
  const turnRunning = !submitting && (turnActive || Boolean(pending));
  // Cancellation is cooperative: the request returns as soon as it is recorded,
  // but the turn only stops at the next graph node boundary, which can be a
  // whole model call away. Keeping the control in its stopping state until the
  // turn genuinely ends is what stops it snapping back to the square and
  // reading as a click that did nothing.
  const stopPending = turnRunning && (stopping || stopRequested);
  const streamError = rawStreamError && !recovering && !decisionSubmitting ? safeError(rawStreamError, t) : null;
  // Live states are worth a line; the idle one only repeats what an empty
  // conversation already says, so it stays unwritten.
  const status = stopPending
    ? t('agent.state.stopping')
    : recovering || projectionRetryAvailable
    ? t('agent.state.recovering')
    : pending
      ? t('agent.state.awaiting')
      : state.completed && activitySettled
        ? t('agent.state.done')
        : state.failed && activitySettled
          ? t('agent.state.incomplete')
      : connected
        ? t('agent.state.updating')
        : state.thread
          ? t('agent.state.ready')
          : null;
  const showWelcome = visibleUserTurns.length === 0 && state.events.length === 0;
  const conversationVersion = `${selectedThreadId ?? state.thread?.thread_id ?? 'new'}:${userTurns.length}:${state.cursor}:${pending?.interrupt_id ?? 'none'}:${activitySettled ? 'settled' : 'active'}:${requestError ?? streamError ?? ''}`;
  const autoFollow = useConversationAutoFollow<HTMLDivElement>(conversationVersion);
  const handleActivitySettled = useCallback(() => setActivitySettled(true), []);
  const visibleClarificationHistory = clarificationHistory.filter((item) => item.interruptId !== pending?.interrupt_id);
  /**
   * One block per turn: the operator's message, then the agent work it caused.
   *
   * The column used to render every user bubble in one loop and then a single
   * activity stream, so a multi-turn thread stacked all the questions at the top
   * right and every answer below — the turns ran together with no boundary.
   *
   * Turns are delimited by terminal events, the same rule `AgentActivityStream`
   * already applies internally, so a slice handed to it renders unchanged. A
   * clarification belongs to the turn whose `interrupt_required` raised it.
   */
  const turnBlocks = useMemo(() => {
    const slices: AgentEvent[][] = [];
    let current: AgentEvent[] = [];
    for (const item of state.events) {
      current.push(item);
      if (item.event_type === 'completed' || item.event_type === 'failed') {
        slices.push(current);
        current = [];
      }
    }
    if (current.length) slices.push(current);

    // Prefer cursor ranges: they say exactly which events an exchange caused.
    // Falling back to slice order is only for threads restored from a transcript,
    // where the browser never observed the send.
    const byCursor = visibleUserTurns.length > 0
      && visibleUserTurns.every((turn) => typeof turn.startCursor === 'number');
    const grouped: AgentEvent[][][] = Array.from(
      { length: Math.max(visibleUserTurns.length, slices.length ? 1 : 0, 1) },
      () => [],
    );

    if (byCursor) {
      // Bucket EVENTS, not slices. A slice can span two exchanges — a turn that
      // parks on an interrupt emits no terminal, so the next message's events
      // continue the same unterminated slice. Only the per-event cursor tells
      // them apart.
      const buckets: AgentEvent[][] = Array.from({ length: grouped.length }, () => []);
      for (const item of state.events) {
        let target = 0;
        visibleUserTurns.forEach((turn, index) => {
          if ((turn.startCursor ?? 0) < item.cursor) target = index;
        });
        buckets[target]?.push(item);
      }
      // Within an exchange, a terminal closes one attempt. More than one attempt
      // means the operator pressed retry, and only the newest is shown.
      buckets.forEach((bucket, index) => {
        const attempts: AgentEvent[][] = [];
        let current: AgentEvent[] = [];
        for (const item of bucket) {
          current.push(item);
          if (item.event_type === 'completed' || item.event_type === 'failed') {
            attempts.push(current);
            current = [];
          }
        }
        if (current.length) attempts.push(current);
        grouped[index] = attempts;
      });
    } else {
      // Restored threads never had their sends observed, so fall back to slice
      // order, aligned FORWARD: aligning from the end shifted every earlier
      // answer down by one until the new slice arrived — the jump where content
      // appeared beside the previous chat before settling into place.
      slices.forEach((slice, index) => {
        grouped[Math.min(index, grouped.length - 1)]?.push(slice);
      });
    }

    const count = Math.max(visibleUserTurns.length, grouped.length);
    const assigned = new Set<string>();
    const blocks = Array.from({ length: count }, (_unused, index) => {
      const attempts = grouped[index] ?? [];
      const events = attempts.at(-1) ?? [];
      const interruptIds = new Set(
        events
          .filter((item) => item.event_type === 'interrupt_required')
          .map((item) => String(item.payload.interrupt_id ?? '')),
      );
      const clarifications = visibleClarificationHistory.filter((item) => interruptIds.has(item.interruptId));
      clarifications.forEach((item) => assigned.add(item.interruptId));
      return {
        key: visibleUserTurns[index]?.id ?? `turn-${index}`,
        turn: visibleUserTurns[index],
        events,
        attemptCount: attempts.length,
        clarifications,
        isLast: index === count - 1,
      };
    });

    // An exchange whose interrupt has not landed durably yet still has to show
    // somewhere; the turn in flight is the only honest place for it.
    const leftover = visibleClarificationHistory.filter((item) => !assigned.has(item.interruptId));
    const last = blocks.at(-1);
    if (leftover.length && last) last.clarifications = [...last.clarifications, ...leftover];
    return blocks;
  }, [state.events, visibleUserTurns, visibleClarificationHistory]);

  const showAgentResponseStack = visibleClarificationHistory.length > 0
    || state.events.length > 0
    || awaitingFirstEvent
    || Boolean(pending);
  const visibleThreadTitle = selectedThreadId === state.thread?.thread_id
    ? selectedThreadTitle ?? state.thread.title
    : state.thread?.title;

  // A turn started in this session stops being cancellable when it ends or
  // when it parks on an interrupt. After an interrupt the composer is free
  // again by design, so it must not be held in the stop state.
  useEffect(() => {
    if (state.completed || state.failed || pending) setTurnActive(false);
  }, [state.completed, state.failed, pending]);

  // ...and re-arm it when the graph resumes after a question is answered.
  // Without this the stop control vanished at the FIRST clarification and never
  // came back: only `sendText` ever set the flag, so a turn that asked ten
  // questions spent the rest of its life with no way to stop it.
  useEffect(() => {
    const last = state.events.at(-1)?.event_type;
    if (last === 'resumed' || last === 'interrupt_resolved') setTurnActive(true);
  }, [state.events]);

  useLayoutEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 44), 144)}px`;
  }, [message]);

  return <section aria-label="Agent workspace" className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
    {/* The sidebar already carries the product mark and name, so this row keeps
        only what is not stated anywhere else: what the agent is doing, and how
        much credit is left. */}
    <div data-agent-reading-rail className={`${AGENT_CONTENT_RAIL_CLASS} flex shrink-0 items-center gap-3 px-4 pb-2 pt-3 sm:px-6`}>
      {/* The thread's name identifies what is on screen; the live status only
          qualifies it, so it rides along in muted text rather than standing in
          for the title. */}
      <div className="min-w-0 flex-1">
        {visibleThreadTitle
          ? <p className="truncate text-[length:calc(13px*var(--font-scale))] font-semibold tracking-tight">{visibleThreadTitle}</p>
          : null}
        {status ? <p className="truncate text-[length:calc(12px*var(--font-scale))] text-muted-foreground">{status}</p> : null}
      </div>
      <div data-testid="agent-budget-balance" aria-label="LLM credit balance" className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[length:calc(12px*var(--font-scale))] text-muted-foreground">
        <span>{t('agent.creditsLeft')}</span><strong className="text-foreground">{budgetProgress?.remaining_model_calls ?? '—'}</strong><span>{t('agent.creditsUnit')}</span>
      </div>
    </div>

    <div ref={autoFollow.viewportRef} onScroll={autoFollow.onScroll} data-testid="agent-conversation-viewport" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 sm:px-6">
      {showWelcome ? <div data-agent-reading-rail className={`${AGENT_CONTENT_RAIL_CLASS} flex flex-col items-center pt-[clamp(3rem,12vh,8rem)] text-center`}>
        <BrandMark className="size-14 object-contain" />
        <h3 className="mt-5 text-balance text-[clamp(1.7rem,3vw,2.4rem)] font-semibold tracking-[-0.045em]">{t('agent.introTitle')}</h3>
        <p className="mt-3 max-w-md text-[length:calc(14px*var(--font-scale))] leading-relaxed text-muted-foreground">{t('agent.introBody')}</p>
        <div className="mt-7 grid w-full gap-2 text-left">{starterKeys.map((key) => { const starter = t(key); return <button key={key} type="button" onClick={() => setMessage(starter)} className="rounded-xl border border-border bg-card px-4 py-3 text-left text-[length:calc(13px*var(--font-scale))] leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface hover:text-foreground">{starter}</button>; })}</div>
      </div> : <div data-agent-reading-rail data-agent-conversation-list="true" className={`${AGENT_CONTENT_RAIL_CLASS} flex flex-col gap-6 pb-0 pt-8`}>
        {turnBlocks.map((block) => <div key={block.key} data-agent-turn="true" className="flex w-full flex-col gap-4">
        {block.turn ? <UserTurnBubble turn={block.turn} /> : null}
        {block.clarifications.length || block.events.length || (block.isLast && (awaitingFirstEvent || pending)) ? <div data-agent-response-stack="true" className="flex w-full flex-col gap-2">
          {block.clarifications.map((item) => (
            <ClarificationHistoryItem key={item.interruptId} item={item} t={t} language={language} />
          ))}
          {block.events.length || (block.isLast && awaitingFirstEvent) ? <AgentActivityStream events={block.events} draft={block.isLast ? state.ephemeral : emptyEphemeralDraft} awaitingFirstEvent={block.isLast && awaitingFirstEvent} startedAtMs={block.isLast ? turnStartedAtMs : null} stopRequested={block.isLast && stopRequested} onSettled={block.isLast ? handleActivitySettled : undefined} onRetry={block.isLast && !composerLocked ? retryLastTurn : undefined} onRevealFrame={block.isLast ? autoFollow.followNow : undefined} onOpenCapabilities={onOpenCapabilities} /> : null}
          {block.isLast && pending ? (
          clarification ? (
            // A clarification is a question, not a gate. Keep it in the same
            // chronological column as the agent turn that produced it.
            <section role="region" aria-label="Pending agent interrupt" className="w-full">
            {currentOptimisticClarification ? <article aria-label="Agent clarification answer">
              <ClarificationAnswerLine field={currentOptimisticClarification.field} answer={currentOptimisticClarification.answer} t={t} language={language} />
            </article> : <div>
              <AgentClarificationCard
                // Remounts on a new interrupt, which resets the free-text field
                // without an effect that could miss a case.
                key={pending.interrupt_id}
                field={clarification.field}
                prompt={localizedClarificationPrompt(clarification, t)}
                choices={clarification.choices}
                allowsOther={clarification.allows_other}
                submitting={decisionSubmitting}
                onChoose={(ordinal) => void decide('answer', String(ordinal))}
                onAnswerOther={(text) => void decide('answer', text)}
              />
            </div>}
            </section>
          ) : (
            // An approval really is a gate on Build/Run, so it keeps its framing.
            <section role="region" aria-label="Pending agent interrupt" className="w-full">
            <div className="w-full rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-primary" /><strong className="text-[length:calc(13px*var(--font-scale))]">Xác nhận trước khi tiếp tục</strong></div>
              <p className="mt-2 text-[length:calc(14px*var(--font-scale))] leading-[1.65] text-muted-foreground">{localizedInterruptSummary(pending, t)}</p>
              {pending.allowed_decisions.includes('answer') ? (
                <div className="mt-3 flex gap-2">
                  <label className="sr-only" htmlFor="agent-interrupt-answer">Clarification answer</label>
                  <input id="agent-interrupt-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} className="min-h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3.5 text-[length:calc(13px*var(--font-scale))] outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
                  <button type="button" disabled={decisionSubmitting || !answer.trim()} onClick={() => void decide('answer')} className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-primary px-4 text-[length:calc(13px*var(--font-scale))] font-medium text-primary-foreground disabled:opacity-45">Trả lời</button>
                </div>
              ) : null}
              {pending.allowed_decisions.some((item) => item === 'approve' || item === 'reject') ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {pending.allowed_decisions.includes('approve') ? <button type="button" disabled={decisionSubmitting} onClick={() => void decide('approve')} className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-[length:calc(13px*var(--font-scale))] font-medium text-primary-foreground disabled:opacity-45">Phê duyệt</button> : null}
                  {pending.allowed_decisions.includes('reject') ? <button type="button" disabled={decisionSubmitting} onClick={() => void decide('reject')} className="inline-flex min-h-9 items-center rounded-full border border-border px-4 text-[length:calc(13px*var(--font-scale))] font-medium outline-none transition-colors duration-150 hover:bg-surface disabled:opacity-45">Từ chối</button> : null}
                </div>
              ) : null}
              </div>
            </section>
          )
          ) : null}
          {block.isLast && !pending && (() => {
            const projection = recoveryFromEvents(block.events);
            if (!projection) return null;
            return <RecoveryAction t={t}
              projection={projection}
              onRetry={retryLastTurn}
              onStartNew={() => { activeThreadIdRef.current = null; disconnect(); reset(); clearLocalView(); }}
              onClarify={() => messageInputRef.current?.focus()}
            />;
          })()}
        </div> : null}
        </div>)}
      </div>}

      {/* Written by the workspace, not by the agent: kept out of the turn
          blocks and styled apart so it cannot read as something the agent said. */}
      {workspaceNotes.length ? <div data-agent-reading-rail className={`${AGENT_CONTENT_RAIL_CLASS} mt-5 flex flex-col gap-2`}>
        {workspaceNotes.map((note) => (
          <p key={note.id} data-testid="workspace-note" className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-3 text-[length:calc(12.5px*var(--font-scale))] leading-relaxed text-muted-foreground">{note.text}</p>
        ))}
      </div> : null}

      {onOpenCanvas ? <section data-agent-reading-rail className={`${AGENT_CONTENT_RAIL_CLASS} mt-5`}>
        <CanvasArtifactCard
          title={canvasArtifact?.title}
          description={canvasArtifact?.description}
          meta={canvasArtifact?.meta}
          onOpen={() => onOpenCanvas(canvasArtifact?.step ?? 'structured')}
        />
      </section> : null}
    </div>

    {autoFollow.detached ? <button type="button" onClick={autoFollow.jumpToLatest} className="absolute bottom-[5.75rem] left-1/2 z-10 flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 text-[length:calc(12px*var(--font-scale))] font-medium text-foreground shadow-[0_8px_24px_rgba(43,31,24,0.12)] outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40">
      <ArrowDown aria-hidden="true" className="size-3.5" /> {t('agent.jumpToNew')}
    </button> : null}

    <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6">
      <div data-agent-reading-rail className={AGENT_CONTENT_RAIL_CLASS}>
        {requestError || streamError ? <p role="status" className="mb-3 text-[length:calc(13px*var(--font-scale))] text-destructive">{requestError ?? streamError}</p> : null}
        {projectionRetryAvailable ? <div className="mb-3 flex items-center gap-2"><button type="button" onClick={() => { const retry = lastDecisionRef.current; if (retry) void decide(retry, retry === 'answer' ? lastAnswerRef.current : undefined); }} className="rounded-lg bg-primary px-3 py-2 text-[length:calc(13px*var(--font-scale))] font-semibold text-primary-foreground">Thử lại</button></div> : null}
        <form onSubmit={(event) => void submit(event)} className="flex items-end gap-1.5 rounded-2xl border border-input bg-card p-1.5 shadow-[0_8px_28px_rgba(43,31,24,0.08)] transition-shadow focus-within:ring-2 focus-within:ring-ring/25">
          {onOpenCapabilities ? <button type="button" onClick={onOpenCapabilities} aria-label={t('agent.openCapabilities')} title={t('agent.capabilities')} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"><Plus aria-hidden="true" className="size-5" /></button> : null}
          <label className="sr-only" htmlFor="agent-thread-message">{state.thread ? 'Agent message' : 'Agent goal'}</label>
          <textarea ref={messageInputRef} id="agent-thread-message" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }} required rows={1} disabled={composerLocked || turnRunning} placeholder={state.thread ? t('agent.composerContinue') : t('agent.composerStart')} className="chat-composer-input min-h-11 max-h-36 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-[length:calc(13px*var(--font-scale))] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-45" />
          {/* One button in three states, never changing size or position: a
              resizing control reads as a different control (spec 6.2). */}
          <button
            type={turnRunning ? 'button' : 'submit'}
            onClick={turnRunning ? () => void stopTurn() : undefined}
            disabled={turnRunning ? stopPending : composerLocked}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-45"
            aria-label={turnRunning ? (stopPending ? t('agent.stoppingTurn') : t('agent.stopTurn')) : state.thread ? t('agent.sendMessage') : t('agent.startThread')}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={turnRunning ? (stopPending ? 'stopping' : 'stop') : submitting || recovering ? 'busy' : 'send'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="grid place-items-center"
              >
                {turnRunning
                  // Cancellation is cooperative — it lands at the next graph
                  // node boundary — so the press has to be acknowledged at once
                  // or it reads as unresponsive.
                  ? stopPending
                    ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    : <Square aria-hidden="true" className="size-3.5 fill-current" />
                  : submitting || recovering
                    ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    : <Send aria-hidden="true" className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </form>
      </div>
    </div>
  </section>;
});
