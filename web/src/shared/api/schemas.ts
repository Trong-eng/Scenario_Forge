import { z } from 'zod';

export const DefinitionVersionSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  project_id: z.string(),
  definition_id: z.string(),
  version: z.number().int().min(1),
  description: z.string(),
  content_hash: z.string(),
}).strict();

export const ScenarioVariantSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  variant_id: z.string(),
  parent_definition_hash: z.string(),
  catalog_version: z.string(),
  content_hash: z.string(),
}).strict();

export const ProviderScenarioVariantSchema = ScenarioVariantSchema.extend({
  version: z.number().int().min(1),
  parent_definition: z.record(z.unknown()).nullable(), identity: z.record(z.unknown()).nullable(),
  bindings: z.record(z.unknown()), coordinate_semantics: z.record(z.unknown()), assumptions: z.array(z.record(z.unknown())),
  provenance: z.record(z.unknown()), original_values: z.record(z.unknown()), display_values: z.record(z.unknown()), internal_values: z.record(z.unknown()),
}).strict();

export const ProviderDefinitionReadSchema = z.object({
  request_id: z.string(), job_id: z.string().nullable(), job_status: z.string().nullable(), correlation_id: z.string(),
  definition_version_id: z.string(), definition: DefinitionVersionSchema, claims: z.array(z.record(z.unknown())),
  logical_ir: z.record(z.unknown()), provenance: z.record(z.unknown()), supersedes: z.string().nullable(),
  archived: z.boolean().default(false), archived_at: z.string().nullable().default(null),
}).strict();

export const ProviderDefinitionCompletedSchema = ProviderDefinitionReadSchema.extend({ created: z.boolean() }).strict();

const ProviderDefinitionAcceptedSchema = z.object({
  request_id: z.string(), job_id: z.string(), job_status: z.string(), correlation_id: z.string(),
  created: z.literal(false), definition: z.null(),
}).strict();

export const ProviderDefinitionSchema = z.union([
  ProviderDefinitionCompletedSchema,
  ProviderDefinitionAcceptedSchema,
]);

export const StructuredDefinitionEditSchema = z.object({
  path: z.enum([
    'environment.weather', 'environment.time_of_day', 'environment.road_surface',
    'environment.visibility', 'environment.approach', 'environment.location',
    'actors.ego.type', 'actors.other.type', 'maneuvers.action', 'constraints.speed',
  ]),
  value: z.union([z.string(), z.number()]),
}).strict();

export const ProviderDefinitionPageSchema = z.object({
  project_id: z.string(),
  items: z.array(ProviderDefinitionReadSchema),
  next_cursor: z.string().nullable(),
}).strict();

const ClarificationQuestionItemSchema = z.object({
  question_id: z.string(),
  field: z.string(),
  prompt: z.string(),
  prompt_key: z.string(),
  options: z.array(z.object({
    option_id: z.string(), value: z.string(), label: z.string(), label_key: z.string(),
  }).strict()),
  allows_free_text: z.boolean(),
  questions: z.array(z.unknown()).optional(),
}).strict();

export const ProviderJobSchema = z.object({
  job_id: z.string(), job_type: z.string(), project_id: z.string(), subject_hash: z.string(), status: z.string(),
  idempotency_key: z.string(), attempt: z.number().int(), available_at: z.string(), lease_expires_at: z.string().nullable(),
  lease_owner: z.string().nullable(), payload: z.record(z.unknown()), result: z.record(z.unknown()).nullable(),
  failure_class: z.string().nullable(), correlation_id: z.string(), schema_version: z.string(), created_at: z.string(), updated_at: z.string(),
  // Additive job metadata. Optional keeps the browser compatible
  // with a backend that predates the deadline/settlement migration, while
  // strict parsing still rejects unrelated response drift.
  deadline_at: z.string().nullable().optional(), lease_generation: z.number().int().min(0).optional(),
  settlement_generation: z.number().int().min(1).nullable().optional(), settlement_code: z.string().nullable().optional(),
  settled_at: z.string().nullable().optional(), worker_resume_key: z.string().nullable().optional(),
  resumable: z.boolean().optional(),
}).strict();

export const ProviderApprovalSchema = z.object({
  approval_id: z.string(), project_id: z.string(), build_id: z.string(), manifest_hash: z.string(),
  reviewer_id: z.string(), decision: z.enum(['approved', 'rejected']), created_at: z.string(),
  invalidated: z.boolean(), invalidation_reason: z.string().nullable(),
}).strict();

export const BuildSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  build_id: z.string(),
  variant_hash: z.string(),
  generation_mode: z.enum(['baseline', 'rag']),
  manifest_hash: z.string(),
}).strict();

export const ProviderBuildSchema = z.object({
  build_id: z.string(), project_id: z.string(), definition_version_id: z.string().nullable().optional(),
  definition_id: z.string().nullable().optional(), definition_version: z.number().int().nullable().optional(),
  variant_id: z.string(), variant_version: z.number().int(), parent_definition_hash: z.string(), variant_hash: z.string(),
  catalog_version: z.string().nullable().optional(), catalog_reference_id: z.string().nullable().optional(),
  requested_generation_mode: z.enum(['baseline', 'rag']), generation_mode: z.enum(['baseline', 'rag']), fallback_used: z.boolean(),
  retrieval_id: z.string().nullable().optional(), retrieval_hash: z.string().nullable().optional(),
  artifact_references: z.array(z.object({ artifact_type: z.string(), uri_key: z.string(), media_type: z.string(), byte_size: z.number().int(), checksum: z.string() }).strict()),
  generator_version: z.string(), model_version: z.string(), prompt_version: z.string(),
  component_versions: z.record(z.string()), toolchain_versions: z.record(z.string()), scenic_source: z.string(),
  validation_report: z.record(z.unknown()), compile_report: z.record(z.unknown()), sampling_report: z.record(z.unknown()),
  repair_history: z.array(z.record(z.unknown())), manifest_hash: z.string(),
}).strict();

export const ApprovalRecordSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  build_id: z.string(),
  manifest_hash: z.string(),
  reviewer_id: z.string(),
  decision: z.enum(['approved', 'rejected']),
}).strict();

export const ExecutionJobSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  job_id: z.string(),
  job_type: z.string(),
  project_id: z.string(),
  subject_hash: z.string(),
  status: z.string(),
}).strict();

export const RunSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  run_id: z.string(),
  build_id: z.string(),
  manifest_hash: z.string(),
  seed: z.number().int(),
  status: z.string(),
}).strict();

export const ErrorEnvelopeSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  failure_class: z.enum([
    'INPUT_OR_CONTRACT', 'VALIDATION_OR_BUILD', 'INFRASTRUCTURE', 'RUNTIME_SCENARIO', 'SECURITY_OR_POLICY', 'CANCELLED',
  ]),
  code: z.string(), message: z.string(), retryable: z.boolean(), correlation_id: z.string(),
}).strict();

const RecoveryStatusSchema = z.enum(['OPEN', 'CANCELLED', 'SUCCESSOR_PUBLISHED']);
const RecoveryConsentStateSchema = z.enum(['PENDING', 'APPROVED', 'DECLINED']);
const RecoveryTargetSchema = z.enum(['published', 'grounded', 'buildable', 'approved', 'runnable']);
const RecoveryTerminalOutcomeSchema = z.enum([
  'COMPLETED', 'CANCELLED', 'PUBLISHED_BEFORE_CANCEL', 'CANCELLED_AFTER_PUBLISH',
  'BUDGET_EXHAUSTED_AFTER_PUBLISH',
]);

export const RecoveryLineageRefSchema = z.object({
  project_id: z.string().min(1),
  definition_id: z.string().min(1),
  definition_version: z.number().int().min(1),
  definition_version_id: z.string().min(1),
  content_hash: z.string().min(1),
}).strict();

export const RecoveryLockRecordSchema = z.object({
  recovery_id: z.string().min(1),
  project_id: z.string().min(1),
  actor_ref: z.string().min(1),
  source_definition_version_id: z.string().min(1),
  source_definition_id: z.string().min(1),
  source_version: z.number().int().min(1),
  source_content_hash: z.string().min(1),
  recovery_session_id: z.string().min(1).nullable(),
  requested_target: RecoveryTargetSchema,
  status: RecoveryStatusSchema,
  consent_state: RecoveryConsentStateSchema,
  acquisition_action_key: z.string().min(1),
  acquisition_action_digest: z.string().min(1),
  consent_action_key: z.string().min(1).nullable(),
  consent_action_digest: z.string().min(1).nullable(),
  publish_action_key: z.string().min(1).nullable(),
  publish_action_digest: z.string().min(1).nullable(),
  successor_definition_version_id: z.string().min(1).nullable(),
  state_version: z.number().int().min(1),
  correlation_id: z.string().min(1),
  reason_code: z.string().min(1),
  terminal_outcome: RecoveryTerminalOutcomeSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  schema_version: z.string().default('1.0.0').optional(),
}).strict();

export const RecoveryRequiredResultSchema = z.object({
  recovery_required: z.literal(true),
  reason_code: z.string().min(1),
  source: RecoveryLineageRefSchema,
  recovery: RecoveryLockRecordSchema,
  allowed_actions: z.array(z.enum(['approve', 'cancel', 'refresh'])).min(1),
}).strict();

/** Additive error envelope returned when a published v1 needs explicit recovery. */
export const RecoveryRequiredErrorSchema = ErrorEnvelopeSchema.extend({
  recovery_required: z.literal(true),
  reason_code: z.string().min(1),
  source: RecoveryLineageRefSchema,
  recovery: RecoveryLockRecordSchema,
  allowed_actions: z.array(z.enum(['approve', 'cancel', 'refresh'])).min(1),
}).strict();

export const RecoveryConsentResultSchema = z.object({
  recovery: RecoveryLockRecordSchema,
  replayed: z.boolean(),
}).strict();

export const RecoveryClarificationResultSchema = z.object({
  recovery_id: z.string().min(1),
  project_id: z.string().min(1),
  recovery_session_id: z.string().min(1),
  state_version: z.number().int().min(1),
  session_state_version: z.number().int().min(1),
  session_status: z.string().min(1),
  question_id: z.string().nullable(),
  question_field: z.string().nullable(),
  question: ClarificationQuestionItemSchema.nullable().optional(),
  round: z.number().int().min(1),
  version: z.number().int().min(1),
  publish_job_id: z.string().nullable(),
  review_required: z.boolean(),
  replayed: z.boolean(),
}).strict();

export const RecoveryDownstreamResultSchema = z.object({
  recovery_id: z.string().min(1),
  project_id: z.string().min(1),
  successor_definition_version_id: z.string().min(1),
  successor_content_hash: z.string().nullable().optional(),
  target: RecoveryTargetSchema,
  terminal_outcome: RecoveryTerminalOutcomeSchema.nullable(),
  variant: ProviderScenarioVariantSchema.nullable().optional(),
  // The server's queue projection is intentionally opaque to the browser;
  // consumers use build_job_id for status polling and never render payloads.
  build_job: z.unknown().nullable().optional(),
  build_job_id: z.string().nullable().optional(),
  variant_hash: z.string().nullable().optional(),
  reached_target: z.boolean(),
  replayed: z.boolean(),
}).strict();

export const RecoveryPublishResultSchema = z.object({
  recovery: RecoveryLockRecordSchema,
  successor: z.record(z.unknown()),
  replayed: z.boolean(),
}).strict();

export const RunContractSchema = RunSchema.extend({
  mode: z.enum(['smoke', 'full']).optional(),
});

export const RunViewSchema = z.object({
  run: RunContractSchema,
  job_id: z.string().nullable(),
  approval_id: z.string().nullable(),
  attempt: z.number().int().min(0),
  status: z.string(),
  progress: z.object({ phase: z.string().nullable(), completed_steps: z.number().int().nullable(), total_steps: z.number().int().nullable() }).strict(),
  sampled_values: z.record(z.unknown()),
  versions: z.record(z.unknown()).nullable(),
  failure: ErrorEnvelopeSchema.nullable(),
  cleanup: z.object({ outcome: z.string(), detail: z.string().nullable().optional() }).passthrough(),
  artifact: z.record(z.unknown()).nullable(),
  replay_of: z.string().nullable(),
}).strict();

export const RunDispatchSchema = z.object({ run: RunViewSchema, created: z.boolean() }).strict();

export const RegistryQuerySchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  project_id: z.string(),
  cursor: z.string().nullable().optional(),
  page_size: z.number().int().min(1).max(100).default(25).optional(),
}).strict();

export const ArtifactManifestSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  artifact_id: z.string(),
  checksum: z.string(),
  project_id: z.string(),
  retention_class: z.string(),
}).strict();

export const EvaluationResultSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  definition_hash: z.string(),
  evaluation_id: z.string(),
  outcome: z.string(),
  run_id: z.string(),
}).strict();

export const ProviderEvaluationSchema = z.object({
  schema_version: z.string(), evaluation: EvaluationResultSchema, report: z.record(z.unknown()),
}).strict();

export const RetrievalRecordSchema = z.object({
  schema_version: z.string().default('1.0.0').optional(),
  corpus_version: z.string(),
  fallback_used: z.boolean(),
  retrieval_id: z.string(),
}).strict();

export type DefinitionVersion = z.infer<typeof DefinitionVersionSchema>;
export type ScenarioVariant = z.infer<typeof ScenarioVariantSchema>;
export type Build = z.infer<typeof BuildSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
export type ExecutionJob = z.infer<typeof ExecutionJobSchema>;
export type Run = z.infer<typeof RunSchema>;
export type RegistryQuery = z.infer<typeof RegistryQuerySchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
export type RecoveryLineageRef = z.infer<typeof RecoveryLineageRefSchema>;
export type RecoveryLockRecord = z.infer<typeof RecoveryLockRecordSchema>;
export type RecoveryRequiredResult = z.infer<typeof RecoveryRequiredResultSchema>;
export type RecoveryRequiredError = z.infer<typeof RecoveryRequiredErrorSchema>;
export type RecoveryConsentResult = z.infer<typeof RecoveryConsentResultSchema>;
export type RecoveryClarificationResult = z.infer<typeof RecoveryClarificationResultSchema>;
export type RecoveryDownstreamResult = z.infer<typeof RecoveryDownstreamResultSchema>;
export type RecoveryPublishResult = z.infer<typeof RecoveryPublishResultSchema>;
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
export type RetrievalRecord = z.infer<typeof RetrievalRecordSchema>;
export type ProviderDefinition = z.infer<typeof ProviderDefinitionReadSchema>;
export type ProviderDefinitionPage = z.infer<typeof ProviderDefinitionPageSchema>;
export type ProviderVariant = z.infer<typeof ProviderScenarioVariantSchema>;
export type ProviderBuild = z.infer<typeof ProviderBuildSchema>;
export type ProviderJob = z.infer<typeof ProviderJobSchema>;
export type ProviderApproval = z.infer<typeof ProviderApprovalSchema>;
export type ProviderRunView = z.infer<typeof RunViewSchema>;
export type ProviderEvaluation = z.infer<typeof ProviderEvaluationSchema>;
export type ProviderRegistryPage = z.infer<typeof ProviderRegistryResponseSchema>;
export type ProviderRegistryItem = ProviderRegistryPage['items'][number];
export type ProviderArtifact = z.infer<typeof ProviderArtifactSchema>;
export type RegistryArtifactOutcome = z.infer<typeof RegistryArtifactOutcomeSchema>;

export const RegistryItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  build_id: z.string(),
  manifest_hash: z.string(),
  seed: z.number().int(),
  created_at: z.string(),
}).strict();

export const RegistryResponseSchema = z.object({
  items: z.array(RegistryItemSchema),
}).strict();

export const ProviderRegistryResponseSchema = z.object({
  project_id: z.string(), items: z.array(z.object({
    project_id: z.string(), definition_version_id: z.string(), definition_id: z.string(), definition_version: z.number().int(),
    definition_hash: z.string(), variant_id: z.string(), variant_version: z.number().int(), variant_hash: z.string(),
    build_id: z.string(), manifest_hash: z.string(), requested_generation_mode: z.enum(['baseline', 'rag']),
    effective_generation_mode: z.enum(['baseline', 'rag']), fallback_used: z.boolean(), retrieval_id: z.string().nullable(),
    retrieval_hash: z.string().nullable(), run_id: z.string().nullable(), run_seed: z.number().int().nullable(),
    run_status: z.string().nullable(), runtime_versions: z.record(z.string()), definition_semantic: z.record(z.unknown()),
    variant_semantic: z.record(z.unknown()), variant_provenance: z.record(z.unknown()), build_toolchain_versions: z.record(z.string()),
    artifact_ids: z.array(z.string()), artifact_states: z.record(z.string()), evaluation_id: z.string().nullable(),
    evaluation_outcome: z.string().nullable(), evaluation_details: z.record(z.unknown()), failure_code: z.string().nullable(), source_version: z.string(),
  }).strict()), next_cursor: z.string().nullable(),
}).strict();

export const RegistryComparisonSchema = z.object({
  project_id: z.string(), left_build_id: z.string(), right_build_id: z.string(), definition_changes: z.array(z.string()),
  variant_changes: z.array(z.string()), build_changes: z.array(z.string()), run_changes: z.array(z.string()),
  evaluation_changes: z.array(z.string()), scenic_claims: z.array(z.string()),
}).strict();

export const RegistryReplaySchema = z.object({
  project_id: z.string(), build_id: z.string(), manifest_hash: z.string(), seed: z.number().int(), run_id: z.string(), created: z.boolean(),
}).strict();

export const RegistryArtifactOutcomeSchema = z.object({
  project_id: z.string(), artifact_id: z.string(), status: z.enum(['published', 'missing', 'expired', 'corrupt', 'incomplete', 'tombstone']),
  manifest_hash: z.string().nullable(), checksum: z.string().nullable(), public_uri: z.string().nullable(), tombstone_reason: z.string().nullable(),
}).strict();

export const ProviderArtifactSchema = z.object({
  artifact_id: z.string(), project_id: z.string(), owning_entity_type: z.enum(['build', 'run']), owning_entity_id: z.string(),
  artifact_type: z.string(), producer_component: z.string(), uri_key: z.string(), byte_size: z.number().int().nonnegative(), media_type: z.string(),
  checksum: z.string(), retention_class: z.string(), status: z.enum(['incomplete', 'published', 'missing', 'corrupt', 'orphaned', 'tombstone']), created_at: z.string(),
}).strict();

export const ProviderArtifactsSchema = z.array(ProviderArtifactSchema);

export type RegistryItem = z.infer<typeof RegistryItemSchema>;
export type RegistryResponse = z.infer<typeof RegistryResponseSchema>;
