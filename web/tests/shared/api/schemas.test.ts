import { describe, it, expect } from 'vitest';
import {
  DefinitionVersionSchema,
  ScenarioVariantSchema,
  BuildSchema,
  ApprovalRecordSchema,
  ExecutionJobSchema,
  ProviderJobSchema,
  RunSchema,
  ErrorEnvelopeSchema,
  ArtifactManifestSchema,
  EvaluationResultSchema,
  RetrievalRecordSchema,
  RecoveryRequiredErrorSchema,
  RecoveryLockRecordSchema,
  RecoveryClarificationResultSchema,
  RecoveryDownstreamResultSchema,
} from '../../../src/shared/api/schemas';

describe('OpenAPI Runtime Zod Schemas', () => {
  it('validates a valid DefinitionVersion object', () => {
    const data = {
      project_id: 'proj-001',
      definition_id: 'def-001',
      version: 1,
      description: 'Highway overtake scenario',
      content_hash: 'sha256:abc123def456',
    };
    const result = DefinitionVersionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates a valid ScenarioVariant object', () => {
    const data = {
      variant_id: 'var-001',
      parent_definition_hash: 'sha256:abc123def456',
      catalog_version: '1.0.0',
      content_hash: 'sha256:789xyz',
    };
    const result = ScenarioVariantSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates a valid Build object', () => {
    const data = {
      build_id: 'bld-001',
      variant_hash: 'sha256:789xyz',
      generation_mode: 'baseline',
      manifest_hash: 'sha256:manifest123',
    };
    const result = BuildSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates a valid ApprovalRecord object', () => {
    const data = {
      build_id: 'bld-001',
      manifest_hash: 'sha256:manifest123',
      reviewer_id: 'usr-tuan',
      decision: 'approved',
    };
    const result = ApprovalRecordSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates a valid ExecutionJob object', () => {
    const data = {
      job_id: 'job-001',
      job_type: 'build',
      project_id: 'proj-001',
      subject_hash: 'sha256:789xyz',
      status: 'completed',
    };
    const result = ExecutionJobSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates the complete provider Build Job and rejects unrelated keys', () => {
    const job = {
      job_id: 'job-001', job_type: 'BUILD_SCENARIO', project_id: 'proj-001', subject_hash: 'sha256:789xyz', status: 'QUEUED',
      idempotency_key: 'idem-001', attempt: 0, available_at: '2026-08-15T00:00:00Z', lease_expires_at: null,
      lease_owner: null, payload: {}, result: null, failure_class: null, correlation_id: 'corr-001', schema_version: '1.0.0',
      created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z', deadline_at: '2026-08-15T01:00:00Z',
      lease_generation: 0, settlement_generation: null, settlement_code: null, settled_at: null,
      worker_resume_key: null, resumable: false,
    };

    expect(ProviderJobSchema.safeParse(job).success).toBe(true);
    expect(ProviderJobSchema.safeParse({ ...job, unexpected: true }).success).toBe(false);
  });

  it('validates a valid Run object', () => {
    const data = {
      run_id: 'run-001',
      build_id: 'bld-001',
      manifest_hash: 'sha256:manifest123',
      seed: 42,
      status: 'completed',
    };
    const result = RunSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates ErrorEnvelope object', () => {
    const data = {
      failure_class: 'VALIDATION_OR_BUILD',
      code: 'ERR_BUILD_FAILED',
      message: 'Failed to generate Scenic script',
      retryable: false,
      correlation_id: 'corr-001',
    };
    const result = ErrorEnvelopeSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates ArtifactManifest object', () => {
    const data = {
      artifact_id: 'art-001',
      checksum: 'sha256:art123',
      project_id: 'proj-001',
      retention_class: 'permanent',
    };
    const result = ArtifactManifestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates EvaluationResult object', () => {
    const data = {
      evaluation_id: 'eval-001',
      definition_hash: 'sha256:def123',
      outcome: 'pass',
      run_id: 'run-001',
    };
    const result = EvaluationResultSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates RetrievalRecord object', () => {
    const data = {
      retrieval_id: 'ret-001',
      corpus_version: 'v1.0',
      fallback_used: false,
    };
    const result = RetrievalRecordSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('validates the safe recoverable grounding projection and rejects provider payloads', () => {
    const lock = {
      recovery_id: 'recovery-1', project_id: 'proj-001', actor_ref: 'actor-1',
      source_definition_version_id: 'dv-1', source_definition_id: 'def-1', source_version: 1,
      source_content_hash: 'sha256:' + 'a'.repeat(64), recovery_session_id: 'session-1',
      requested_target: 'buildable', status: 'OPEN', consent_state: 'PENDING',
      acquisition_action_key: 'ground-1', acquisition_action_digest: 'sha256:' + 'b'.repeat(64),
      consent_action_key: null, consent_action_digest: null, publish_action_key: null,
      publish_action_digest: null, successor_definition_version_id: null, state_version: 1,
      correlation_id: 'corr-1', reason_code: 'UNSUPPORTED_SEMANTICS', terminal_outcome: null,
      created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z', schema_version: '1.0.0',
    };
    const result = RecoveryRequiredErrorSchema.safeParse({
      failure_class: 'INPUT_OR_CONTRACT',
      code: 'UNSUPPORTED_SEMANTICS',
      message: 'The published definition needs explicit recovery before it can be grounded.',
      retryable: false,
      correlation_id: 'corr-1',
      recovery_required: true,
      reason_code: 'UNSUPPORTED_SEMANTICS',
      source: {
        project_id: 'proj-001', definition_id: 'def-1', definition_version: 1,
        definition_version_id: 'dv-1', content_hash: 'sha256:' + 'a'.repeat(64),
      },
      recovery: lock,
      allowed_actions: ['approve', 'cancel', 'refresh'],
    });

    expect(result.success).toBe(true);
    expect(RecoveryLockRecordSchema.safeParse({ ...lock, raw_transcript: 'secret' }).success).toBe(false);
    expect(RecoveryRequiredErrorSchema.safeParse({
      ...(result.success ? result.data : {}), provider_output: 'secret provider response',
    }).success).toBe(false);
  });

  it('validates safe recovery answer and downstream projections without provider payloads', () => {
    const answer = RecoveryClarificationResultSchema.safeParse({
      recovery_id: 'recovery-1', project_id: 'proj-001', recovery_session_id: 'session-1',
      state_version: 2, session_state_version: 3, session_status: 'needs_clarification',
      question_id: 'question-2', question_field: 'actors', question: null,
      round: 2, version: 3, publish_job_id: null, review_required: false, replayed: false,
    });
    const downstream = RecoveryDownstreamResultSchema.safeParse({
      recovery_id: 'recovery-1', project_id: 'proj-001', successor_definition_version_id: 'dv-2',
      successor_content_hash: 'sha256:' + '2'.repeat(64), target: 'buildable',
      terminal_outcome: 'COMPLETED', variant: null, build_job: null, build_job_id: 'job-2',
      variant_hash: 'sha256:' + '3'.repeat(64), reached_target: true, replayed: false,
    });

    expect(answer.success).toBe(true);
    expect(downstream.success).toBe(true);
    expect(RecoveryDownstreamResultSchema.safeParse({
      ...(downstream.success ? downstream.data : {}), provider_output: 'secret',
    }).success).toBe(false);
  });

  describe('Negative validations', () => {
    it('rejects missing required field', () => {
      const data = {
        project_id: 'proj-001',
        // missing definition_id
        version: 1,
        description: 'Highway overtake scenario',
        content_hash: 'sha256:abc123def456',
      };
      const result = DefinitionVersionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects invalid enum', () => {
      const data = {
        build_id: 'bld-001',
        variant_hash: 'sha256:789xyz',
        generation_mode: 'invalid_mode', // should be baseline or rag
        manifest_hash: 'sha256:manifest123',
      };
      const result = BuildSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects extra property due to strict mode', () => {
      const data = {
        build_id: 'bld-001',
        variant_hash: 'sha256:789xyz',
        generation_mode: 'baseline',
        manifest_hash: 'sha256:manifest123',
        extra_field: 'should fail',
      };
      const result = BuildSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects invalid integer/range', () => {
      const data = {
        project_id: 'proj-001',
        definition_id: 'def-001',
        version: 0, // min is 1
        description: 'Highway overtake scenario',
        content_hash: 'sha256:abc123def456',
      };
      const result = DefinitionVersionSchema.safeParse(data);
      expect(result.success).toBe(false);

      const resultFloat = DefinitionVersionSchema.safeParse({ ...data, version: 1.5 });
      expect(resultFloat.success).toBe(false);
    });
  });
});
