import { z } from 'zod';

/**
 * Typed capability metadata projection — additive, versioned, and redacted.
 * Mirrors ``src/services/scenario_forge/capabilities/agent_adapter.py``.
 * Never carries ScenarioIR, Scenic source, or telemetry.
 */

export const CAPABILITY_SCHEMA_VERSION = '1.0.0' as const;
export const CAPABILITY_SET_VERSION = '1.0.0' as const;

const SEMANTIC_VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const SAFE_CAPABILITY_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const SAFE_CAPABILITY_CODE_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

/** Registry/reference-shaped strings accepted from the redacted API envelope. */
export const CapabilityReferenceSchema = z.string().regex(SAFE_CAPABILITY_REFERENCE_RE);
export type CapabilityReference = z.infer<typeof CapabilityReferenceSchema>;

export const CapabilityKindSchema = z.enum(['primitive', 'pattern']);
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;

export const CapabilityStatusSchema = z.enum(['planned', 'experimental', 'stable', 'deprecated', 'disabled']);
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

export const CapabilitySupportStateSchema = z.enum([
  'recognized',
  'planned',
  'authorable',
  'runnable',
  'measurable',
  'experimental',
  'disabled',
  'deprecated',
  'unsupported',
]);
export type CapabilitySupportState = z.infer<typeof CapabilitySupportStateSchema>;

export const EvidenceLevelSchema = z.enum([
  'parsed',
  'grounded',
  'compiled',
  'scenic_generated',
  'static_validated',
  'carla_verified',
  'evaluation_verified',
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

export const NextActionSchema = z.enum([
  'clarify',
  'revise',
  'use_current',
  'preview',
  'build',
  'approval_required',
  'stop',
]);
export type NextAction = z.infer<typeof NextActionSchema>;

export const TopologySchema = z.enum([
  'straight_road',
  'multi_lane_road',
  'intersection',
  'signalized_intersection',
  'roundabout',
  'crosswalk',
  'parking_lane',
  'occluded_roadside',
]);
export type Topology = z.infer<typeof TopologySchema>;

export const ActorTypeSchema = z.enum(['Car', 'Pedestrian', 'Bicycle']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const EventKindSchema = z.enum([
  'completion',
  'avoidance',
  'lane_change',
  'braking',
  'stopping',
  'junction_traversal',
  'overtake',
  'order_flip',
  'return_to_lane',
]);
export type EventKind = z.infer<typeof EventKindSchema>;

/** One bounded capability row. Extra fields are forbidden on the wire. */
export const CapabilityMetadataItemSchema = z
  .object({
    capability_id: CapabilityReferenceSchema,
    kind: CapabilityKindSchema,
    display_name: z.string().min(1).max(64),
    status: CapabilityStatusSchema,
    support_state: CapabilitySupportStateSchema,
    evidence_level: EvidenceLevelSchema,
    required_fields: z.array(CapabilityReferenceSchema).max(16).default([]),
    supported_actor_types: z.array(ActorTypeSchema).max(8).default([]),
    supported_topologies: z.array(TopologySchema).max(8).default([]),
    expected_events: z.array(EventKindSchema).max(8).default([]),
    allowed_next_actions: z.array(NextActionSchema).max(8).default([]),
  })
  .strict();
export type CapabilityMetadataItem = z.infer<typeof CapabilityMetadataItemSchema>;

export const CapabilityScopeSchema = z
  .object({
    project_id: CapabilityReferenceSchema,
    actor_ref: CapabilityReferenceSchema,
    map_id: CapabilityReferenceSchema.nullable().optional(),
    profile_id: CapabilityReferenceSchema.nullable().optional(),
    catalog_version: z.string().regex(SEMANTIC_VERSION_RE).nullable().optional(),
    topology: TopologySchema.nullable().optional(),
  })
  .strict();
export type CapabilityScope = z.infer<typeof CapabilityScopeSchema>;

export const CapabilityListResultSchema = z
  .object({
    operation: z.literal('scenario.capabilities.list').default('scenario.capabilities.list'),
    schema_version: z.string().regex(SEMANTIC_VERSION_RE),
    capability_set_version: z.string().regex(SEMANTIC_VERSION_RE),
    query_id: CapabilityReferenceSchema,
    scope: CapabilityScopeSchema,
    status: z.enum(['available', 'unavailable']),
    items: z.array(CapabilityMetadataItemSchema).max(64).default([]),
    allowed_next_actions: z.array(NextActionSchema).max(8).default([]),
    summary: z.string().max(512).default(''),
    error_code: z.string().regex(SAFE_CAPABILITY_CODE_RE).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // The pane fails closed on version drift rather than showing stale names.
    if (value.schema_version !== CAPABILITY_SCHEMA_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schema_version'],
        message: `Unsupported capability schema_version: ${value.schema_version}`,
      });
    }
    if (value.capability_set_version !== CAPABILITY_SET_VERSION) {
      // stale-version is a valid UI state, not a parse failure. The caller
      // checks capability_set_version explicitly.
    }
  });
export type CapabilityListResult = z.infer<typeof CapabilityListResultSchema>;

export const CapabilityCheckResultSchema = z
  .object({
    operation: z.literal('scenario.capabilities.check').default('scenario.capabilities.check'),
    schema_version: z.string().regex(SEMANTIC_VERSION_RE),
    capability_set_version: z.string().regex(SEMANTIC_VERSION_RE),
    query_id: CapabilityReferenceSchema,
    scope: CapabilityScopeSchema,
    check: z.enum(['valid', 'clarify', 'unsupported', 'experimental_review', 'unavailable']),
    involved_ids: z.array(CapabilityReferenceSchema).max(8).default([]),
    items: z.array(CapabilityMetadataItemSchema).max(8).default([]),
    missing_fields: z.array(CapabilityReferenceSchema).max(16).default([]),
    incompatible_pairs: z.array(z.tuple([CapabilityReferenceSchema, CapabilityReferenceSchema])).max(8).default([]),
    safe_alternatives: z.array(CapabilityReferenceSchema).max(8).default([]),
    allowed_next_actions: z.array(NextActionSchema).max(8).default([]),
    summary: z.string().max(512).default(''),
    error_code: z.string().regex(SAFE_CAPABILITY_CODE_RE).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.schema_version !== CAPABILITY_SCHEMA_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schema_version'],
        message: `Unsupported capability schema_version: ${value.schema_version}`,
      });
    }
  });
export type CapabilityCheckResult = z.infer<typeof CapabilityCheckResultSchema>;

/** Redacted error that never carries raw IR/source/telemetry. */
export const CapabilityErrorSchema = z
  .object({
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(512),
    retryable: z.boolean().optional(),
    correlation_id: z.string().optional(),
  })
  .strict();
export type CapabilityError = z.infer<typeof CapabilityErrorSchema>;

/**
 * View model used by the Workspace pane. Pure projection, no fetching.
 */
export type CapabilityCatalogView =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'unavailable'; errorCode?: string; summary?: string }
  | { kind: 'stale-version'; expectedVersion: string; actualVersion: string; summary?: string }
  | { kind: 'error'; code: string; message: string; retryable?: boolean }
  | { kind: 'ready'; version: string; capabilities: readonly CapabilityMetadataItem[]; summary: string; queryId: string };

/**
 * Pure derivation: map a validated list result into a UI view.
 * Fails closed on unavailable, stale, and redacted-error envelopes.
 */
export function deriveCapabilityCatalogView(result: CapabilityListResult | null | undefined): CapabilityCatalogView {
  if (result === null || result === undefined) return { kind: 'loading' };
  // Validate envelope without throwing: an invalid payload is an error state,
  // not a crash that hides the workspace.
  const parsed = CapabilityListResultSchema.safeParse(result);
  if (!parsed.success) {
    return {
      kind: 'error',
      code: 'ERR_INVALID_CAPABILITY_RESPONSE',
      message: 'Danh mục năng lực trả về không hợp lệ và đã bị chặn.',
    };
  }
  const data = parsed.data;
  if (data.status === 'unavailable') {
    // Stale version is a distinct UI state so the operator knows to refresh.
    if (data.error_code === 'CAPABILITY_SET_VERSION_STALE') {
      return {
        kind: 'stale-version',
        expectedVersion: CAPABILITY_SET_VERSION,
        actualVersion: data.capability_set_version,
        summary: data.summary,
      };
    }
    return {
      kind: 'unavailable',
      errorCode: data.error_code ?? undefined,
      summary: data.summary,
    };
  }
  if (data.capability_set_version !== CAPABILITY_SET_VERSION) {
    return {
      kind: 'stale-version',
      expectedVersion: CAPABILITY_SET_VERSION,
      actualVersion: data.capability_set_version,
      summary: data.summary,
    };
  }
  if (data.schema_version !== CAPABILITY_SCHEMA_VERSION) {
    return {
      kind: 'error',
      code: 'CAPABILITY_SCHEMA_VERSION_MISMATCH',
      message: `Phiên bản schema không khớp (server ${data.schema_version}, expected ${CAPABILITY_SCHEMA_VERSION}).`,
    };
  }
  if (data.items.length === 0) return { kind: 'empty' };
  return {
    kind: 'ready',
    version: data.capability_set_version,
    capabilities: data.items,
    summary: data.summary,
    queryId: data.query_id,
  };
}

/** Whether a capability may be selected for Agent preflight. */
export function isCapabilitySelectable(item: CapabilityMetadataItem): boolean {
  // Only stable + authorable (static_validated) are runnable today.
  // Planned and experimental are visible but non-selectable (TIP-005/006).
  // Disabled/deprecated are never selectable.
  if (item.status === 'planned' || item.status === 'disabled' || item.status === 'deprecated') return false;
  if (item.status === 'experimental') return false;
  if (item.support_state === 'planned' || item.support_state === 'experimental' || item.support_state === 'disabled' || item.support_state === 'deprecated' || item.support_state === 'unsupported') return false;
  // Executable stable patterns/primitives are selectable; others are not.
  return item.allowed_next_actions.includes('preview') || item.allowed_next_actions.includes('build');
}

/** Human-readable status label for the pane. */
export const CAPABILITY_STATUS_LABEL: Record<CapabilityStatus, string> = {
  planned: 'Planned',
  experimental: 'Experimental',
  stable: 'Stable',
  deprecated: 'Deprecated',
  disabled: 'Disabled',
};

export const CAPABILITY_SUPPORT_STATE_LABEL: Record<CapabilitySupportState, string> = {
  recognized: 'Recognized',
  planned: 'Planned',
  authorable: 'Authorable',
  runnable: 'Runnable',
  measurable: 'Measurable',
  experimental: 'Experimental',
  disabled: 'Disabled',
  deprecated: 'Deprecated',
  unsupported: 'Unsupported',
};

export const EVIDENCE_LEVEL_LABEL: Record<EvidenceLevel, string> = {
  parsed: 'Parsed',
  grounded: 'Grounded',
  compiled: 'Compiled',
  scenic_generated: 'Scenic generated',
  static_validated: 'Static validated',
  carla_verified: 'CARLA verified',
  evaluation_verified: 'Evaluation verified',
};

const SAFE_CAPABILITY_ID_RE = /^[a-z][a-z0-9_]{2,63}$/;

// Canonical allowlist derived from the pinned registry (1.0.0). Used for
// extra injection defense: an unknown ID is treated as "unknown" and the
// display name is omitted, so a crafted payload cannot smuggle raw text into
// the Agent composer.
const KNOWN_CAPABILITY_IDS = new Set<string>([
  'follow_lane',
  'cross_path',
  'emerge_from_occlusion',
  'cut_in',
  'brake',
  'junction_conflict',
  'enter_roundabout',
  'overtake',
  'lane_change',
  'lane_merge',
  'following',
  'lead_vehicle_braking',
  'emergency_braking',
  'vehicle_avoidance',
  'obstacle_avoidance',
  'junction_approach',
  'traffic_light_stop',
  'stop_and_go',
  'parked_vehicle_obstruction',
  'door_opening_obstruction',
  'rear_end_risk',
  'lane_follow',
  'crossing',
  'pedestrian_occlusion',
  'cut_in_merge',
  'hard_brake',
  'intersection_conflict',
  'roundabout',
]);

/**
 * Bounded, injection-safe capability intent handed to the Agent composer.
 *
 * - Enforces `SAFE_CAPABILITY_ID_RE` and the pinned registry allowlist; unknown
 *   or overlong IDs become the canonical `unknown` marker.
 * - The display name is intentionally omitted from the intent. It remains
 *   available to the visual row, but cannot carry prompt text into Agent.
 * - Final intent is hard-capped at 64 chars and free of metacharacters.
 * - The Supervisor routes this text via `project_capability_ids`; the raw
 *   string never becomes ScenarioIR or a Build.
 */
function canonicalCapabilityId(capabilityId: unknown): string {
  if (typeof capabilityId !== 'string') return 'unknown';
  const normalized = capabilityId.trim().toLowerCase();
  return SAFE_CAPABILITY_ID_RE.test(normalized) && KNOWN_CAPABILITY_IDS.has(normalized)
    ? normalized
    : 'unknown';
}

export function capabilityIntent(capabilityId: string, _displayName?: string | null): string {
  // The fixed template contains no user-controlled text. The final slice is a
  // defense-in-depth bound even if the template changes in a future release.
  return `kịch bản: ${canonicalCapabilityId(capabilityId)}`.slice(0, 64);
}

export function isSafeCapabilityId(capabilityId: string): boolean {
  return canonicalCapabilityId(capabilityId) !== 'unknown';
}

export function isSafeCapabilityReference(value: unknown): value is CapabilityReference {
  return typeof value === 'string' && SAFE_CAPABILITY_REFERENCE_RE.test(value);
}

/** Whether a list result is stale and needs a fresh read. */
export function isCapabilityResultStale(result: CapabilityListResult): boolean {
  return result.capability_set_version !== CAPABILITY_SET_VERSION;
}
