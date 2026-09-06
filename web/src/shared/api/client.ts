import { z } from 'zod';
import type { paths } from './generated';
import type { AgentBudgetProgress, AgentEphemeralFrame, AgentEvent, AgentInterruptDecisionResponse, AgentPendingInterrupt, AgentThread, AgentThreadPage, AgentTranscriptPage } from './agentTypes';
import { ApprovalRecordSchema, BuildSchema, ProviderApprovalSchema, ProviderBuildSchema, ProviderDefinitionSchema, ProviderDefinitionCompletedSchema, ProviderDefinitionReadSchema, ProviderDefinitionPageSchema, ProviderEvaluationSchema, ProviderJobSchema, DefinitionVersionSchema, ErrorEnvelopeSchema, RecoveryClarificationResultSchema, RecoveryConsentResultSchema, RecoveryDownstreamResultSchema, RecoveryLockRecordSchema, RecoveryPublishResultSchema, RecoveryRequiredErrorSchema, ExecutionJobSchema, RunDispatchSchema, RunSchema, RunViewSchema, ProviderScenarioVariantSchema, ProviderRegistryResponseSchema, RegistryResponseSchema, RegistryComparisonSchema, RegistryReplaySchema, RegistryArtifactOutcomeSchema, ProviderArtifactsSchema, type ApprovalRecord, type Build, type DefinitionVersion, type ErrorEnvelope, type RecoveryClarificationResult, type RecoveryConsentResult, type RecoveryDownstreamResult, type RecoveryLockRecord, type RecoveryPublishResult, type RecoveryRequiredError, type ExecutionJob, type ProviderBuild, type Run } from './schemas';

export interface ProviderRequestContext {
  projectId: string;
  projectToken: string;
  correlationId: string;
  idempotencyKey?: string;
  /** Optional non-secret actor reference; server authorization remains authoritative. */
  actorRef?: string;
}

export type ApiErrorEnvelope = ErrorEnvelope | RecoveryRequiredError;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.name = 'ApiError';
  }
}

export type BudgetExtensionView = { extension_id: string; subject_user_id: string; project_id: string; additional_model_calls: number; additional_question_limit: number; additional_answer_storage_limit: number; reason: string; issuer_user_id: string; created_at: string; expires_at: string; revoked_at: string | null; status: string };
export type MemberBudgetView = { subject_user_id: string; project_id: string; email: string | null; name: string | null; role: string | null; used: number; effective_limit: number; remaining: number; expires_at: string | null; status: string; extensions: BudgetExtensionView[]; model_call_limit: number; delivered_question_limit: number; answer_storage_limit: number; backend_active_limit_seconds: number; human_response_limit_seconds: number; policy_source: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';
const agentApiBaseUrl = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? apiBaseUrl;

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const url = /^https?:\/\//.test(path) ? path : `${apiBaseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const candidate = payload && typeof payload === 'object' && 'detail' in payload
      ? (payload as { detail: unknown }).detail
      : payload;
    const recovery = RecoveryRequiredErrorSchema.safeParse(candidate);
    const parsed = ErrorEnvelopeSchema.safeParse(candidate);
    throw new ApiError(response.status, recovery.success ? recovery.data : parsed.success ? parsed.data : {
      schema_version: '1.0.0', failure_class: 'INFRASTRUCTURE', code: 'ERR_INVALID_ERROR_RESPONSE', message: 'The API returned an invalid error response.', retryable: false, correlation_id: 'unknown',
    });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError(502, {
    schema_version: '1.0.0', failure_class: 'INFRASTRUCTURE', code: 'ERR_INVALID_SUCCESS_RESPONSE', message: 'The API returned an invalid success response.', retryable: false, correlation_id: 'unknown',
  });
  return parsed.data;
}

const json = (body: unknown, headers?: HeadersInit): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers });

function invalidStream(message: string) {
  return new ApiError(502, {
    schema_version: '1.0.0', failure_class: 'INFRASTRUCTURE', code: 'ERR_INVALID_STREAM',
    message, retryable: false, correlation_id: 'unknown',
  });
}

const providerHeaders = (context: ProviderRequestContext, includeIdempotency = false): HeadersInit => ({
  'X-Project-Token': context.projectToken,
  'X-Correlation-ID': context.correlationId,
  ...(includeIdempotency && context.idempotencyKey ? { 'Idempotency-Key': context.idempotencyKey } : {}),
});

type GroundOperation = paths['/projects/{project_id}/variants/ground']['post'];
type ApprovalOperation = paths['/projects/{project_id}/builds/{build_id}/approvals']['post'];
void (0 as unknown as GroundOperation | ApprovalOperation);

const byUnicodeScalar = (leftValue: string, rightValue: string) => {
  const left = [...leftValue];
  const right = [...rightValue];
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index].codePointAt(0)! - right[index].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
};

function normalizeCanonical(value: unknown): unknown {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(normalizeCanonical);
  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => byUnicodeScalar(left, right))
      .forEach(([key, item]) => { normalized[key.normalize('NFC')] = normalizeCanonical(item); });
    return normalized;
  }
  return value;
}

function stable(value: unknown): string {
  const normalized = normalizeCanonical(value);
  if (Array.isArray(normalized)) return `[${normalized.map(stable).join(',')}]`;
  if (normalized && typeof normalized === 'object') return `{${Object.entries(normalized as Record<string, unknown>).sort(([left], [right]) => byUnicodeScalar(left, right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(normalized);
}

async function commandKey(operation: string, context: ProviderRequestContext, target: string, payload: unknown) {
  const bytes = new TextEncoder().encode(stable({ operation, project_id: context.projectId, target, payload }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function releaseJson(operation: string, target: string, path: string, body: unknown, schema: z.ZodTypeAny, context: ProviderRequestContext) {
  const idempotencyKey = await commandKey(operation, context, target, body);
  return request(path, schema, json(body, { ...providerHeaders(context), 'Idempotency-Key': idempotencyKey }));
}

const scoped = (context: ProviderRequestContext | undefined, suffix: string, legacy: string) =>
  context ? `/api/v1/projects/${encodeURIComponent(context.projectId)}${suffix}` : legacy;

const AgentThreadSchema: z.ZodType<AgentThread> = z.object({
  thread_id: z.string(), project_id: z.string(), status: z.string(), title: z.string().min(1).max(200), summary: z.string(),
  turn_count: z.number().int().nonnegative(), created_at: z.string(), updated_at: z.string(), correlation_id: z.string(),
}).strict();
const AgentThreadPageSchema: z.ZodType<AgentThreadPage> = z.object({
  items: z.array(AgentThreadSchema), next_cursor: z.string().nullable(), correlation_id: z.string(),
}).strict();
const AgentBudgetProgressSchema: z.ZodType<AgentBudgetProgress> = z.object({
  session_id: z.string(), status: z.string(), model_calls_used: z.number().int().nonnegative(),
  model_call_limit: z.number().int().nonnegative().nullable(), remaining_model_calls: z.number().int().nonnegative().nullable(),
  backend_active_elapsed_ms: z.number().int().nonnegative(), backend_active_limit_ms: z.number().int().positive(),
  question_response_elapsed_ms: z.number().int().nonnegative(), question_response_limit_ms: z.number().int().positive(),
  blocking_questions_used: z.number().int().nonnegative(), blocking_question_limit: z.number().int().nonnegative(),
  answers_stored: z.number().int().nonnegative(), answer_storage_limit: z.number().int().nonnegative(),
  retry_generation: z.number().int().nonnegative(), terminal_code: z.string().nullable(), correlation_id: z.string(),
}).strict();
const AgentTranscriptPageSchema: z.ZodType<AgentTranscriptPage> = z.object({
  items: z.array(z.object({
    message_id: z.string(), role: z.literal('user'), safe_summary: z.string().max(4096), created_at: z.string(),
  }).strict()),
  correlation_id: z.string(),
}).strict();
const agentEventTypes = ['plan_created', 'plan_updated', 'tool_started', 'tool_result', 'job_waiting', 'interrupt_required', 'repair_attempt', 'retry_attempt', 'verification', 'message_delta', 'reasoning_summary_delta', 'assistant_text_delta', 'interrupt_resolved', 'resumed', 'completed', 'failed'] as const;
const AgentEventEnvelopeSchema = z.object({
  event_id: z.string(), cursor: z.number().int().positive(), event_type: z.string(),
  thread_id: z.string(), step_id: z.string().nullable(), correlation_id: z.string(), payload: z.unknown(), created_at: z.string(),
}).strict();
const ReasoningSummaryDeltaPayloadSchema = z.object({
  segment_id: z.string().min(1), stage: z.enum(['intake', 'analysis', 'planning', 'execution', 'verification']),
  sequence: z.number().int().positive(), delta: z.string(),
}).strict();
const AssistantTextDeltaPayloadSchema = z.object({
  message_id: z.string().min(1), sequence: z.number().int().positive(), delta: z.string(),
}).strict();
const AgentEventSchema = z.object({
  event_id: z.string(), cursor: z.number().int().positive(), event_type: z.enum(agentEventTypes),
  thread_id: z.string(), step_id: z.string().nullable(), correlation_id: z.string(), payload: z.record(z.unknown()), created_at: z.string(),
}).strict().superRefine((event, context) => {
  const payloadSchema = event.event_type === 'reasoning_summary_delta'
    ? ReasoningSummaryDeltaPayloadSchema
    : event.event_type === 'assistant_text_delta' ? AssistantTextDeltaPayloadSchema : null;
  if (payloadSchema && !payloadSchema.safeParse(event.payload).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['payload'], message: 'Invalid realtime delta payload.' });
  }
});
const knownAgentEventTypes = new Set<string>(agentEventTypes);
/** ADR-0008 presentation-only frame: no cursor, never persisted, never resumed from. */
const ephemeralFrameTypes = ['reasoning_summary_delta', 'assistant_text_delta'] as const;
const AgentEphemeralFrameSchema = z.object({
  event_id: z.string(), event_type: z.enum(ephemeralFrameTypes),
  thread_id: z.string(), step_id: z.string().nullable().optional(), correlation_id: z.string(),
  payload: z.record(z.unknown()), created_at: z.string(), ephemeral: z.literal(true),
}).superRefine((frame, context) => {
  const payloadSchema = frame.event_type === 'reasoning_summary_delta'
    ? ReasoningSummaryDeltaPayloadSchema
    : AssistantTextDeltaPayloadSchema;
  if (!payloadSchema.safeParse(frame.payload).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['payload'], message: 'Invalid ephemeral delta payload.' });
  }
});
const AgentClarificationPendingSchema = z.object({
  field: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(z.object({
    ordinal: z.number().int().min(1).max(32),
    value: z.string().min(1),
    label: z.string().min(1),
  })),
  allows_other: z.boolean(),
  subject: z.string().min(1).max(64).optional(),
  actor_ref: z.string().min(1).max(64).optional(),
});
const AgentPendingInterruptSchema: z.ZodType<AgentPendingInterrupt> = z.object({
  interrupt_id: z.string(), thread_id: z.string(), kind: z.enum(['clarification', 'approval', 'run']),
  reason: z.string(), allowed_decisions: z.array(z.enum(['approve', 'reject', 'answer'])),
  target_hash: z.string(), target_params_hash: z.string(), display_summary: z.string(),
  created_at: z.string(), correlation_id: z.string(),
  clarification: AgentClarificationPendingSchema.nullish(),
});
const AgentInterruptDecisionResponseSchema: z.ZodType<AgentInterruptDecisionResponse> = z.object({
  status: z.union([z.literal('resolved'), z.literal('resuming')]), interrupt_id: z.string(), message_id: z.string().nullable(),
  resumed: z.literal(true), correlation_id: z.string(),
});

export type AgentEventStreamCallbacks = {
  /** Callback results are deliberately ignored; only an awaited Promise controls delivery. */
  onEvent: (event: AgentEvent) => unknown | Promise<unknown>;
  /** ADR-0008 ephemeral frame. Presentation only: it advances no cursor. */
  onEphemeral?: (frame: AgentEphemeralFrame) => unknown;
  onReconnect?: (afterCursor: number, attempt: number) => unknown;
  onError?: (error: unknown) => unknown;
};

export type AgentEventStreamOptions = {
  signal?: AbortSignal;
  afterCursor?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  /** Opt in to the ADR-0008 live leg. Off keeps the pre-ADR-0008 snapshot. */
  live?: boolean;
  /** Read one durable replay snapshot and return; used as a live-stream fallback. */
  singleSnapshot?: boolean;
};

const waitForRetry = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('The event stream was aborted.', 'AbortError')); return; }
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('The event stream was aborted.', 'AbortError')); }, { once: true });
});

const idlePollDelaysMs = [150, 250, 400, 750] as const;

/** Consume the durable event ledger with cursor resume and at-least-once dedupe. */
async function streamAgentEvents(
  threadId: string,
  context: ProviderRequestContext,
  callbacks: AgentEventStreamCallbacks,
  options: AgentEventStreamOptions = {},
): Promise<void> {
  let afterCursor = Math.max(0, options.afterCursor ?? 0);
  const seenCursors = new Set<number>();
  const seenEventIds = new Set<string>();
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 250;
  let transportAttempt = 0;
  let consecutiveIdleSnapshots = 0;
  let terminal = false;
  while (true) {
    if (options.signal?.aborted) return;
    try {
      const response = await fetch(
        `${agentApiBaseUrl}/api/v1/projects/${encodeURIComponent(context.projectId)}/agent/threads/${encodeURIComponent(threadId)}/events?after=${afterCursor}${options.live ? '&live=1' : ''}`,
        { signal: options.signal, headers: { ...providerHeaders(context), Accept: 'text/event-stream' } },
      );
      if (!response.ok || !response.body) throw new ApiError(response.status || 502, {
        schema_version: '1.0.0', failure_class: 'INFRASTRUCTURE', code: 'ERR_AGENT_EVENT_STREAM',
        message: 'The agent event stream is unavailable.', retryable: response.status >= 500, correlation_id: 'unknown',
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let snapshotDeliveredCursor = false;
      const consume = async (frame: string) => {
        const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
        if (!data) return;
        let payload: unknown;
        try { payload = JSON.parse(data); } catch { throw invalidStream('The agent event stream is malformed.'); }
        // ADR-0008: an ephemeral frame carries no cursor and must never touch
        // `afterCursor`, or a reconnect would resume past durable events that
        // were never delivered. Dropping a malformed one is the safe degrade —
        // it is presentation only, so it cannot corrupt the ledger view.
        if (typeof payload === 'object' && payload !== null && (payload as { ephemeral?: unknown }).ephemeral === true) {
          const frame = AgentEphemeralFrameSchema.safeParse(payload);
          if (frame.success) callbacks.onEphemeral?.(frame.data as AgentEphemeralFrame);
          return;
        }
        const envelope = AgentEventEnvelopeSchema.safeParse(payload);
        if (!envelope.success) throw invalidStream('The agent event stream is malformed.');
        if (seenCursors.has(envelope.data.cursor)) return;
        seenCursors.add(envelope.data.cursor);
        snapshotDeliveredCursor ||= envelope.data.cursor > afterCursor;
        afterCursor = Math.max(afterCursor, envelope.data.cursor);
        if (seenEventIds.has(envelope.data.event_id)) return;
        if (!knownAgentEventTypes.has(envelope.data.event_type)) {
          seenEventIds.add(envelope.data.event_id);
          return;
        }
        const parsed = AgentEventSchema.safeParse(payload);
        if (!parsed.success) throw invalidStream('The agent event stream is malformed.');
        seenEventIds.add(parsed.data.event_id);
        terminal ||= parsed.data.event_type === 'completed' || parsed.data.event_type === 'failed';
        await callbacks.onEvent(parsed.data as AgentEvent);
      };
      while (!options.signal?.aborted) {
        const next = await reader.read();
        pending += decoder.decode(next.value, { stream: !next.done });
        let boundary = pending.indexOf('\n\n');
        while (boundary >= 0) {
          await consume(pending.slice(0, boundary));
          pending = pending.slice(boundary + 2);
          boundary = pending.indexOf('\n\n');
        }
        if (next.done) break;
      }
      if (options.signal?.aborted || terminal || options.singleSnapshot) return;
      transportAttempt = 0;
      if (snapshotDeliveredCursor) {
        consecutiveIdleSnapshots = 0;
        callbacks.onReconnect?.(afterCursor, 0);
        continue;
      }
      consecutiveIdleSnapshots += 1;
      callbacks.onReconnect?.(afterCursor, consecutiveIdleSnapshots);
      await waitForRetry(idlePollDelaysMs[Math.min(consecutiveIdleSnapshots - 1, idlePollDelaysMs.length - 1)], options.signal);
    } catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      callbacks.onError?.(error);
      if (error instanceof ApiError && !error.envelope.retryable) throw error;
      if (transportAttempt >= maxRetries) throw error;
      transportAttempt += 1;
      callbacks.onReconnect?.(afterCursor, transportAttempt);
      await waitForRetry(Math.min(retryDelayMs * 2 ** (transportAttempt - 1), 5_000), options.signal);
    }
  }
}

async function getPendingAgentInterrupt(
  threadId: string, context: ProviderRequestContext,
): Promise<AgentPendingInterrupt | null> {
  const response = await fetch(`${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}/interrupts/pending`, '')}`, {
    headers: providerHeaders(context),
  });
  if (response.status === 204) return null;
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* normalized below */ }
  if (!response.ok) {
    const candidate = payload && typeof payload === 'object' && 'detail' in payload
      ? (payload as { detail: unknown }).detail : payload;
    const parsed = ErrorEnvelopeSchema.safeParse(candidate);
    throw new ApiError(response.status, parsed.success ? parsed.data : {
      schema_version: '1.0.0', failure_class: 'INFRASTRUCTURE', code: 'ERR_INVALID_ERROR_RESPONSE',
      message: 'The API returned an invalid error response.', retryable: false, correlation_id: 'unknown',
    });
  }
  const parsed = AgentPendingInterruptSchema.safeParse(payload);
  if (!parsed.success) throw invalidStream('The pending interrupt response is malformed.');
  return parsed.data;
}

function getBuild(buildId: string): Promise<Build>;
function getBuild(buildId: string, context: ProviderRequestContext): Promise<ProviderBuild>;
function getBuild(buildId: string, context?: ProviderRequestContext): Promise<Build | ProviderBuild> {
  if (context) {
    return request(
      scoped(context, `/builds/${encodeURIComponent(buildId)}`, ''),
      ProviderBuildSchema,
      { headers: providerHeaders(context) },
    );
  }
  return request(`/api/v1/builds/${encodeURIComponent(buildId)}`, BuildSchema);
}

function getRegistry(projectId?: string): Promise<z.infer<typeof RegistryResponseSchema>>;
function getRegistry(projectId: string | undefined, context: ProviderRequestContext, cursor?: string): Promise<z.infer<typeof ProviderRegistryResponseSchema>>;
function getRegistry(projectId?: string, context?: ProviderRequestContext, cursor?: string) {
  return context
    ? request(
      `${scoped(context, '/registry', '/api/v1/registry')}?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ProviderRegistryResponseSchema,
      { headers: providerHeaders(context) },
    )
    : request(
      projectId ? `/api/v1/registry?project_id=${encodeURIComponent(projectId)}` : '/api/v1/registry',
      RegistryResponseSchema,
    );
}

export const apiClient = {
  listAdminBudgetProjects: () => request<string[]>('/api/v1/admin/budget-projects', z.array(z.string()), { credentials: 'include' }),
  listAdminMembers: (projectId: string) => request<MemberBudgetView[]>(`/api/v1/admin/projects/${encodeURIComponent(projectId)}/members`, z.array(z.any()), { credentials: 'include' }),
  updateBudgetPolicy: (projectId: string, userId: string, body: object) => request(`/api/v1/admin/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/budget-policy`, z.any(), { method: 'PUT', credentials: 'include', ...json(body, { 'Idempotency-Key': `policy-${userId}-${crypto.randomUUID()}` }) }),
  createBudgetExtension: (projectId: string, userId: string, body: { additional_model_calls: number; additional_question_limit: number; additional_answer_storage_limit: number; extension_seconds: number; reason: string }) => request<BudgetExtensionView>(`/api/v1/admin/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/budget-extensions`, z.any(), { ...json(body, { 'Idempotency-Key': `admin-${crypto.randomUUID()}` }), credentials: 'include' }),
  revokeBudgetExtension: (projectId: string, userId: string, extensionId: string) => request<BudgetExtensionView>(`/api/v1/admin/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/budget-extensions/${encodeURIComponent(extensionId)}/revoke`, z.any(), { method: 'POST', credentials: 'include' }),
  streamAgentEvents,
  getPendingAgentInterrupt,
  createAgentThread: (goal: string, context: ProviderRequestContext) => request(
    `${agentApiBaseUrl}${scoped(context, '/agent/threads', '')}`, AgentThreadSchema,
    json({ goal }, providerHeaders(context, true)),
  ),
  appendAgentMessage: (threadId: string, message: string, context: ProviderRequestContext) => request(
    `${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}/messages`, '')}`, AgentThreadSchema,
    json({ message }, providerHeaders(context, true)),
  ),
  /**
   * Stop the turn running on this thread.
   *
   * A 409 means no turn was running to stop — the caller must surface that
   * rather than treat it as success.
   */
  cancelAgentTurn: (threadId: string, context: ProviderRequestContext) => request(
    `${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}/cancel`, '')}`,
    AgentThreadSchema,
    { ...json({}, providerHeaders(context)), method: 'POST' },
  ),
  getAgentThread: (threadId: string, context: ProviderRequestContext) => request(
    `${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}`, '')}`, AgentThreadSchema,
    { headers: providerHeaders(context) },
  ),
  getAgentBudgetProgress: (threadId: string, context: ProviderRequestContext) => request(
    `${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}/budget-progress`, '')}`,
    AgentBudgetProgressSchema,
    { headers: providerHeaders(context) },
  ),
  listAgentThreads: (context: ProviderRequestContext, limit = 50, cursor?: string) => request(
    `${agentApiBaseUrl}${scoped(context, '/agent/threads', '')}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    AgentThreadPageSchema,
    { headers: providerHeaders(context) },
  ),
  getAgentTranscript: (threadId: string, context: ProviderRequestContext) => request(
    `${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}/messages`, '')}`,
    AgentTranscriptPageSchema,
    { headers: providerHeaders(context) },
  ),
  renameAgentThread: (threadId: string, title: string, context: ProviderRequestContext) => request(
    `${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}`, '')}`,
    AgentThreadSchema,
    { ...json({ title }, providerHeaders(context)), method: 'PATCH' },
  ),
  decideAgentInterrupt: (threadId: string, interruptId: string, decision: 'approve' | 'reject' | 'answer', context: ProviderRequestContext, answer?: string) => request(
    `${agentApiBaseUrl}${scoped(context, `/agent/threads/${encodeURIComponent(threadId)}/interrupts/${encodeURIComponent(interruptId)}`, '')}`,
    AgentInterruptDecisionResponseSchema,
    json({ decision, ...(answer ? { answer } : {}) }, { ...providerHeaders(context), Prefer: 'respond-async' }),
  ),
  listDefinitions: (context: ProviderRequestContext, pageSize = 100, includeArchived = false) => request(
    `/api/v1/scenario-forge/definitions?page_size=${pageSize}${includeArchived ? '&include_archived=true' : ''}`,
    ProviderDefinitionPageSchema,
    { headers: { ...providerHeaders(context), 'X-Project-Id': context.projectId } },
  ),
  getDefinition: (definitionId: string, context: ProviderRequestContext, version?: number) => request(
    `/api/v1/scenario-forge/definitions/${encodeURIComponent(definitionId)}${version ? `?version=${version}` : ''}`,
    ProviderDefinitionReadSchema,
    { headers: { ...providerHeaders(context), 'X-Project-Id': context.projectId } },
  ),
  deleteProviderDefinition: (definitionId: string, context: ProviderRequestContext) => request(
    `/api/v1/scenario-forge/definitions/${encodeURIComponent(definitionId)}`,
    z.object({ definition_id: z.string(), deleted_versions: z.number().int().positive() }),
    { method: 'DELETE', headers: { ...providerHeaders(context), 'X-Project-Id': context.projectId } },
  ),
  archiveProviderDefinition: (definitionId: string, context: ProviderRequestContext) => request(
    `/api/v1/scenario-forge/definitions/${encodeURIComponent(definitionId)}/archive`,
    z.object({ definition_id: z.string(), archived: z.literal(true) }),
    { method: 'POST', headers: { ...providerHeaders(context), 'X-Project-Id': context.projectId } },
  ),
  restoreProviderDefinition: (definitionId: string, context: ProviderRequestContext) => request(
    `/api/v1/scenario-forge/definitions/${encodeURIComponent(definitionId)}/archive`,
    z.object({ definition_id: z.string(), archived: z.literal(false) }),
    { method: 'DELETE', headers: { ...providerHeaders(context), 'X-Project-Id': context.projectId } },
  ),
  /**
   * `logical_ir_patch` carries the fields the operator edited in Structured.
   * Without it a new version would be created holding the IR of the old one,
   * which reads as a change and builds the previous scenario.
   */
  patchProviderDefinition: (
    definitionId: string,
    description: string | null,
    baseVersion: number,
    context: ProviderRequestContext,
    structuredEdits?: readonly { path: string; value: string | number }[],
  ) => request(
    `/api/v1/scenario-forge/definitions/${encodeURIComponent(definitionId)}`,
    ProviderDefinitionCompletedSchema,
    {
      method: 'PATCH',
      body: JSON.stringify(structuredEdits?.length
        ? { base_version: baseVersion, structured_edits: structuredEdits }
        : { description, base_version: baseVersion }),
      headers: { ...providerHeaders(context, true), 'X-Project-Id': context.projectId },
    },
  ),
  createProviderDefinition: (description: string, context: ProviderRequestContext) => request('/api/v1/scenario-forge/definitions', ProviderDefinitionSchema, json({ description }, { ...providerHeaders(context, true), 'X-Project-Id': context.projectId })),
  groundVariant: (body: { definition_id: string; version: number; catalog_constraints: Record<string, unknown> }, context: ProviderRequestContext) => releaseJson('ground_variant', 'variant', scoped(context, '/variants/ground', ''), body, ProviderScenarioVariantSchema, context),
  getRecovery: (recoveryId: string, context: ProviderRequestContext): Promise<RecoveryLockRecord> => request(
    scoped(context, `/recoveries/${encodeURIComponent(recoveryId)}`, ''),
    RecoveryLockRecordSchema,
    { headers: providerHeaders(context) },
  ),
  getRecoveryStatus: (recoveryId: string, context: ProviderRequestContext): Promise<RecoveryLockRecord> => apiClient.getRecovery(recoveryId, context),
  consentRecovery: async (
    recoveryId: string,
    body: { decision: 'approve' | 'cancel'; expected_state_version: number },
    context: ProviderRequestContext,
  ): Promise<RecoveryConsentResult> => {
    const actionKey = await commandKey('recovery_consent', context, recoveryId, body);
    const payload = {
      recovery_id: recoveryId,
      project_id: context.projectId,
      actor_ref: context.actorRef ?? 'web-ui',
      ...body,
      action_key: actionKey,
    };
    return request(
      scoped(context, `/recoveries/${encodeURIComponent(recoveryId)}/consent`, ''),
      RecoveryConsentResultSchema,
      json(payload, { ...providerHeaders(context), 'Idempotency-Key': actionKey }),
    );
  },
  requestRecoveryConsent: (
    recoveryId: string,
    body: { decision: 'approve' | 'cancel'; expected_state_version: number },
    context: ProviderRequestContext,
  ): Promise<RecoveryConsentResult> => apiClient.consentRecovery(recoveryId, body, context),
  cancelRecovery: (
    recoveryId: string,
    expectedStateVersion: number,
    context: ProviderRequestContext,
  ): Promise<RecoveryConsentResult> => apiClient.consentRecovery(
    recoveryId,
    { decision: 'cancel', expected_state_version: expectedStateVersion },
    context,
  ),
  answerRecovery: async (
    recoveryId: string,
    body: { question_id: string; answer: string; expected_state_version: number },
    context: ProviderRequestContext,
  ): Promise<RecoveryClarificationResult> => {
    const actionKey = await commandKey('recovery_answer', context, recoveryId, body);
    return request(
      scoped(context, `/recoveries/${encodeURIComponent(recoveryId)}/answers`, ''),
      RecoveryClarificationResultSchema,
      json({ recovery_id: recoveryId, project_id: context.projectId, actor_ref: context.actorRef ?? 'web-ui', ...body, action_key: actionKey }, { ...providerHeaders(context), 'Idempotency-Key': actionKey }),
    );
  },
  reconcileRecovery: async (
    recoveryId: string,
    expectedStateVersion: number,
    context: ProviderRequestContext,
  ): Promise<RecoveryDownstreamResult> => {
    const body = { recovery_id: recoveryId, project_id: context.projectId, expected_state_version: expectedStateVersion };
    const actionKey = await commandKey('recovery_reconcile', context, recoveryId, body);
    return request(
      scoped(context, `/recoveries/${encodeURIComponent(recoveryId)}/reconcile`, ''),
      RecoveryDownstreamResultSchema,
      json({ ...body, action_key: actionKey }, { ...providerHeaders(context), 'Idempotency-Key': actionKey }),
    );
  },
  confirmRecovery: async (
    recoveryId: string,
    expectedStateVersion: number,
    context: ProviderRequestContext,
  ): Promise<RecoveryPublishResult> => {
    const body = { recovery_id: recoveryId, project_id: context.projectId, expected_state_version: expectedStateVersion };
    const actionKey = await commandKey('recovery_confirm', context, recoveryId, body);
    return request(
      scoped(context, `/recoveries/${encodeURIComponent(recoveryId)}/confirm`, ''),
      RecoveryPublishResultSchema,
      json({ ...body, action_key: actionKey }, { ...providerHeaders(context), 'Idempotency-Key': actionKey }),
    );
  },
  createProviderBuild: (variantHash: string, mode: 'baseline' | 'rag', context: ProviderRequestContext, retrievalQuery?: string) => request(scoped(context, '/builds', ''), ProviderJobSchema, json({ variant_hash: variantHash, requested_generation_mode: mode, ...(mode === 'rag' ? { retrieval_query: { project_id: context.projectId, component: 'E', query: retrievalQuery?.trim() || variantHash, filters: {}, corpus_version: process.env.NEXT_PUBLIC_SCENARIO_FORGE_CORPUS_VERSION, top_k: 5 } } : {}) }, providerHeaders(context, true))),
  getBuildJob: (jobId: string, context: ProviderRequestContext) => request(scoped(context, `/build-jobs/${encodeURIComponent(jobId)}`, ''), ProviderJobSchema, { headers: providerHeaders(context) }),
  approveBuild: (buildId: string, body: { manifest_hash: string; decision: 'approved' | 'rejected' }, context: ProviderRequestContext) => releaseJson('approve_build', buildId, scoped(context, `/builds/${encodeURIComponent(buildId)}/approvals`, ''), body, ProviderApprovalSchema, context),
  getEvaluation: (runId: string, context: ProviderRequestContext) => request(scoped(context, `/runs/${encodeURIComponent(runId)}/evaluation`, ''), ProviderEvaluationSchema, { headers: providerHeaders(context) }),
  getBuildArtifacts: (buildId: string, context: ProviderRequestContext) => request(scoped(context, `/builds/${encodeURIComponent(buildId)}/artifacts`, ''), ProviderArtifactsSchema, { headers: providerHeaders(context) }),
  compareRegistry: (leftBuildId: string, rightBuildId: string, context: ProviderRequestContext) => request(
    scoped(context, '/registry/compare', ''), RegistryComparisonSchema,
    json({ project_id: context.projectId, left_build_id: leftBuildId, right_build_id: rightBuildId }, providerHeaders(context)),
  ),
  replayRegistry: (buildId: string, manifestHash: string, seed: number, context: ProviderRequestContext) => releaseJson(
    'registry_replay', buildId, scoped(context, '/registry/replay', ''),
    { project_id: context.projectId, build_id: buildId, manifest_hash: manifestHash, seed, idempotency_key: context.idempotencyKey ?? 'browser-derived' },
    RegistryReplaySchema, context,
  ),
  getRegistryArtifact: (artifactId: string, context: ProviderRequestContext) => request(
    scoped(context, `/registry/artifacts/${encodeURIComponent(artifactId)}`, ''), RegistryArtifactOutcomeSchema,
    { headers: providerHeaders(context) },
  ),
  createDefinition: (body: Pick<DefinitionVersion, 'description'> & Partial<DefinitionVersion>) => request('/api/v1/definitions', DefinitionVersionSchema, json(body)),
  createJob: (body: Partial<ExecutionJob>) => request('/api/v1/jobs', ExecutionJobSchema, json(body)),
  getJob: (jobId: string) => request(`/api/v1/jobs/${jobId}`, ExecutionJobSchema),
  getBuild,
  getProviderBuild: (buildId: string, context: ProviderRequestContext) => request(
    scoped(context, `/builds/${encodeURIComponent(buildId)}`, ''), ProviderBuildSchema,
    { headers: providerHeaders(context) },
  ),
  approve: (body: ApprovalRecord, headers?: HeadersInit) => request('/api/v1/approvals', ApprovalRecordSchema, json(body, headers)),
  updateDefinition: (definitionId: string, body: Partial<DefinitionVersion>, version: number) => request(`/api/v1/definitions/${definitionId}`, DefinitionVersionSchema, { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'If-Match': String(version) } }),
  createRun: async (body: Partial<Run> & { mode?: 'smoke' | 'full' }, context?: ProviderRequestContext) => {
    if (!context) return request('/api/v1/runs', RunSchema, json(body));
    const payload = await request(
      scoped(context, '/runs', '/api/v1/runs'),
      RunDispatchSchema,
      json({ build_id: body.build_id, mode: body.mode ?? 'smoke', seed: body.seed }, providerHeaders(context, true)),
    );
    return { ...payload.run.run, status: payload.run.status };
  },
  getRun: (runId: string, context?: ProviderRequestContext) => request(
    scoped(context, `/runs/${encodeURIComponent(runId)}`, `/api/v1/runs/${runId}`),
    RunViewSchema,
    context ? { headers: providerHeaders(context) } : undefined,
  ).then((view) => ({ ...view.run, status: view.status })),
  getRunView: (runId: string, context: ProviderRequestContext) => request(
    scoped(context, `/runs/${encodeURIComponent(runId)}`, ''), RunViewSchema,
    { headers: providerHeaders(context) },
  ),
  cancelRun: (runId: string, context?: ProviderRequestContext) => request(
    scoped(context, `/runs/${encodeURIComponent(runId)}/cancel`, `/api/v1/runs/${runId}`),
    RunViewSchema,
    context
      ? json({ reason: 'user_requested' }, providerHeaders(context))
      : { method: 'DELETE' },
  ).then((view) => ({ ...view.run, status: view.status })),
  getRegistry,
  getCapabilities: (context: ProviderRequestContext, params?: Record<string, string | boolean | undefined>) => {
    const query = params
      ? `?${Object.entries(params)
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          .join('&')}`
      : '';
    // Lazy import to avoid circular deps; the schema validates version/fields
    // before the pane ever renders capability names.
    const schemaPromise = import('./capabilityTypes').then((capModule) => capModule.CapabilityListResultSchema);
    return schemaPromise.then((schema) =>
      request(
        `${scoped(context, '/capabilities', '')}${query}`,
        schema as z.ZodTypeAny,
        { headers: providerHeaders(context) },
      ),
    );
  },
  checkCapabilities: (
    context: ProviderRequestContext,
    body: { capability_ids: string[]; parameters?: Record<string, unknown>; capability_set_version?: string; map_id?: string; profile_id?: string; topology?: string },
  ) =>
    request(
      scoped(context, '/capabilities/check', ''),
      // Validated as CapabilityCheckResult after fetch; use generic to avoid
      // circular import at module load time.
      z.any(),
      json(body, providerHeaders(context)),
    ).then(async (payload: unknown) => {
      const capModule = await import('./capabilityTypes');
      const parsed = capModule.CapabilityCheckResultSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiError(502, {
          schema_version: '1.0.0',
          failure_class: 'INFRASTRUCTURE',
          code: 'ERR_INVALID_CAPABILITY_CHECK_RESPONSE',
          message: 'The API returned an invalid capability check response.',
          retryable: false,
          correlation_id: 'unknown',
        });
      }
      return parsed.data;
    }),
};

/** Exchange the login JWT for a project-scoped Scenario Forge credential.
 *
 * The workspace authorises with `X-Project-Token`, which is a different
 * credential from the session JWT, so the signed-in user is granted project
 * access here instead of being asked to paste a token. Permissions follow the
 * account role, so an Author cannot approve and a Reviewer cannot run.
 */
export async function createProjectSession(): Promise<{ project_id: string; project_token: string; permissions: string[] }> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/api/v1/auth/project-session`, {
    method: 'POST',
    // The session travels as an HttpOnly cookie; the page never holds the JWT.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`project session failed with status ${response.status}`);
  return response.json();
}
