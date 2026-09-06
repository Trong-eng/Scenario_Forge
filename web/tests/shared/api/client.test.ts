import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { apiClient, ApiError } from '../../../src/shared/api/client';
import { http, HttpResponse, server } from '../../helpers/httpHarness';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('typed API client', () => {
  it('lists and reads project-scoped Definition provider envelopes', async () => {
    const requests: Request[] = [];
    const completed = {
      request_id: 'req-1', job_id: null, job_status: null, correlation_id: 'corr-provider',
      definition_version_id: 'dv-1', supersedes: null,
      definition: { schema_version: '1.0.0', project_id: 'proj-001', definition_id: 'def-1', version: 2, description: 'A crossing', content_hash: 'sha256:def' },
      claims: [{ field: 'maneuver', value: 'crossing', unit: null, source: 'user', evidence: 'crossing', schema_version: '1.0.0' }],
      logical_ir: { actors: ['car'], maneuvers: [{ actor: 'car', action: 'cross' }], environment: {}, constraints: [] },
      provenance: { interpreter_id: 'rule-based', interpreter_version: '1', source: 'user', correlation_id: 'corr-provider', created_at: '2026-08-14T00:00:00Z' },
    };
    server.use(
      http.get('/api/v1/scenario-forge/definitions', ({ request }) => {
        requests.push(request);
        return HttpResponse.json({ project_id: 'proj-001', items: [completed], next_cursor: null });
      }),
      http.get('/api/v1/scenario-forge/definitions/def-1', ({ request }) => {
        requests.push(request);
        return HttpResponse.json(completed);
      }),
    );
    const context = { projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1' };

    const page = await apiClient.listDefinitions(context);
    const detail = await apiClient.getDefinition('def-1', context);

    expect(page.items[0].definition.version).toBe(2);
    expect(detail.logical_ir.maneuvers).toEqual([{ actor: 'car', action: 'cross' }]);
    expect(requests.every((request) => request.headers.get('X-Project-Id') === 'proj-001')).toBe(true);
    expect(requests.every((request) => request.headers.get('X-Project-Token') === 'secret-token')).toBe(true);
  });

  it('patches a Definition with the provider version precondition', async () => {
    let captured: Request | undefined;
    server.use(http.patch('/api/v1/scenario-forge/definitions/def-1', async ({ request }) => {
      captured = request;
      return HttpResponse.json({
        request_id: 'req-2', job_id: null, job_status: null, correlation_id: 'corr-provider', definition_version_id: 'dv-2', created: true,
        definition: { schema_version: '1.0.0', project_id: 'proj-001', definition_id: 'def-1', version: 3, description: 'Updated', content_hash: 'sha256:def-2' },
        claims: [], logical_ir: {}, provenance: {}, supersedes: 'dv-1',
      });
    }));

    const updated = await apiClient.patchProviderDefinition('def-1', 'Updated', 2, {
      projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1', idempotencyKey: 'idem-patch',
    });

    expect(updated.definition.version).toBe(3);
    expect(await captured?.json()).toEqual({ description: 'Updated', base_version: 2 });
    expect(captured?.headers.get('Idempotency-Key')).toBe('idem-patch');
  });

  it('sends Structured edits as the closed path/value alternative', async () => {
    let captured: Request | undefined;
    server.use(http.patch('/api/v1/scenario-forge/definitions/def-1', async ({ request }) => {
      captured = request;
      return HttpResponse.json({
        request_id: 'req-structured', job_id: null, job_status: null, correlation_id: 'corr-provider', definition_version_id: 'dv-2', created: true,
        definition: { schema_version: '1.0.0', project_id: 'proj-001', definition_id: 'def-1', version: 2, description: 'Original', content_hash: 'sha256:def-2' },
        claims: [], logical_ir: {}, provenance: {}, supersedes: 'dv-1', archived: false, archived_at: null,
      });
    }));

    await apiClient.patchProviderDefinition('def-1', null, 1, {
      projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-structured', idempotencyKey: 'idem-structured',
    }, [{ path: 'environment.weather', value: 'clear' }]);

    expect(await captured?.json()).toEqual({
      base_version: 1,
      structured_edits: [{ path: 'environment.weather', value: 'clear' }],
    });
  });

  it('deletes an unreferenced Definition through the project-scoped provider route', async () => {
    let captured: Request | undefined;
    server.use(http.delete('/api/v1/scenario-forge/definitions/def-1', ({ request }) => {
      captured = request;
      return HttpResponse.json({ definition_id: 'def-1', deleted_versions: 1 });
    }));

    const deleted = await apiClient.deleteProviderDefinition('def-1', {
      projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-delete',
    });

    expect(deleted).toEqual({ definition_id: 'def-1', deleted_versions: 1 });
    expect(captured?.method).toBe('DELETE');
    expect(captured?.headers.get('X-Project-Id')).toBe('proj-001');
    expect(captured?.headers.get('X-Project-Token')).toBe('secret-token');
  });

  it('uses real Registry compare, replay, artifact, and Build artifact routes', async () => {
    const seen: string[] = [];
    server.use(
      http.post('/api/v1/projects/proj-001/registry/compare', async ({ request }) => { seen.push(new URL(request.url).pathname); return HttpResponse.json({ project_id: 'proj-001', left_build_id: 'b1', right_build_id: 'b2', definition_changes: [], variant_changes: [], build_changes: ['manifest_hash'], run_changes: [], evaluation_changes: [], scenic_claims: [] }); }),
      http.post('/api/v1/projects/proj-001/registry/replay', async ({ request }) => { seen.push(new URL(request.url).pathname); return HttpResponse.json({ project_id: 'proj-001', build_id: 'b1', manifest_hash: 'sha256:m', seed: 42, run_id: 'run-replay', created: true }); }),
      http.get('/api/v1/projects/proj-001/registry/artifacts/art-1', ({ request }) => { seen.push(new URL(request.url).pathname); return HttpResponse.json({ project_id: 'proj-001', artifact_id: 'art-1', status: 'published', manifest_hash: 'sha256:m', checksum: 'sha256:a', public_uri: 'https://objects.invalid/art-1', tombstone_reason: null }); }),
      http.get('/api/v1/projects/proj-001/builds/b1/artifacts', ({ request }) => { seen.push(new URL(request.url).pathname); return HttpResponse.json([{ artifact_id: 'art-1', project_id: 'proj-001', owning_entity_type: 'build', owning_entity_id: 'b1', artifact_type: 'scenic_source', producer_component: 'CMP-BUILD', uri_key: 'b1/source.scenic', byte_size: 12, media_type: 'text/plain', checksum: 'sha256:a', retention_class: 'default_30d', status: 'published', created_at: '2026-08-14T00:00:00Z' }]); }),
    );
    const context = { projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1' };

    const comparison = await apiClient.compareRegistry('b1', 'b2', context);
    const replay = await apiClient.replayRegistry('b1', 'sha256:m', 42, context);
    const artifact = await apiClient.getRegistryArtifact('art-1', context);
    const artifacts = await apiClient.getBuildArtifacts('b1', context);

    expect(comparison.build_changes).toEqual(['manifest_hash']);
    expect(replay.run_id).toBe('run-replay');
    expect(artifact.status).toBe('published');
    expect(artifacts[0].artifact_type).toBe('scenic_source');
    expect(seen).toEqual([
      '/api/v1/projects/proj-001/registry/compare', '/api/v1/projects/proj-001/registry/replay',
      '/api/v1/projects/proj-001/registry/artifacts/art-1', '/api/v1/projects/proj-001/builds/b1/artifacts',
    ]);
  });

  it('accepts an in-progress Definition replay without a published record', async () => {
    server.use(http.post('/api/v1/scenario-forge/definitions', () => HttpResponse.json({
      request_id: 'req-replay',
      job_id: 'job-1',
      job_status: 'running',
      correlation_id: 'corr-replay',
      created: false,
      definition: null,
    })));

    const result = await apiClient.createProviderDefinition('A crossing scenario', {
      projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1', idempotencyKey: 'idem-1',
    });

    expect(result).toMatchObject({ job_id: 'job-1', job_status: 'running', definition: null, created: false });
  });

  it('grounds and approves through project-scoped release routes', async () => {
    const requests: Request[] = [];
    server.use(
      http.post('/api/v1/projects/proj-001/variants/ground', async ({ request }) => {
        requests.push(request);
        return HttpResponse.json({ variant_id: 'var-1', version: 1, parent_definition_hash: 'sha256:def', parent_definition: null, catalog_version: '1.0.0', content_hash: 'sha256:var', identity: null, bindings: {}, coordinate_semantics: {}, assumptions: [], provenance: {}, original_values: {}, display_values: {}, internal_values: {} });
      }),
      http.post('/api/v1/projects/proj-001/builds/bld-001/approvals', async ({ request }) => {
        requests.push(request);
        return HttpResponse.json({ approval_id: 'approval-1', project_id: 'proj-001', build_id: 'bld-001', manifest_hash: 'sha256:manifest', reviewer_id: 'token-reviewer', decision: 'approved', created_at: '2026-08-13T00:00:00Z', invalidated: false, invalidation_reason: null });
      }),
    );
    const context = { projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1', idempotencyKey: 'idem-1' };
    const variant = await apiClient.groundVariant({ definition_id: 'def-1', version: 1, catalog_constraints: {} }, context);
    const approval = await apiClient.approveBuild('bld-001', { manifest_hash: 'sha256:manifest', decision: 'approved' }, context);
    expect(variant.variant_id).toBe('var-1');
    expect(approval.reviewer_id).toBe('token-reviewer');
    expect(requests.every((request) => request.headers.get('X-Project-Token') === 'secret-token')).toBe(true);
  });

  it('preserves recoverable grounding errors and replays deterministic consent/status commands', async () => {
    const requests: Request[] = [];
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
    const recoveryError = {
      failure_class: 'INPUT_OR_CONTRACT', code: 'UNSUPPORTED_SEMANTICS',
      message: 'The published definition needs explicit recovery before it can be grounded.',
      retryable: false, correlation_id: 'corr-1', recovery_required: true,
      reason_code: 'UNSUPPORTED_SEMANTICS',
      source: { project_id: 'proj-001', definition_id: 'def-1', definition_version: 1, definition_version_id: 'dv-1', content_hash: 'sha256:' + 'a'.repeat(64) },
      recovery: lock, allowed_actions: ['approve', 'cancel', 'refresh'],
    };
    server.use(
      http.post('/api/v1/projects/proj-001/variants/ground', () => HttpResponse.json(recoveryError, { status: 409 })),
      http.get('/api/v1/projects/proj-001/recoveries/recovery-1', () => HttpResponse.json(lock)),
      http.post('/api/v1/projects/proj-001/recoveries/recovery-1/consent', async ({ request }) => {
        requests.push(request.clone());
        const body = await request.clone().json() as Record<string, unknown>;
        expect(body).toMatchObject({ recovery_id: 'recovery-1', project_id: 'proj-001', decision: 'approve', expected_state_version: 1 });
        expect(body).not.toHaveProperty('raw_transcript');
        return HttpResponse.json({ recovery: { ...lock, consent_state: 'APPROVED', state_version: 2 }, replayed: false });
      }),
    );
    const context = { projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1' };

    await expect(apiClient.groundVariant({ definition_id: 'def-1', version: 1, catalog_constraints: {} }, context))
      .rejects.toMatchObject({ status: 409, envelope: { recovery_required: true, recovery: { recovery_id: 'recovery-1' } } });
    const status = await apiClient.getRecovery('recovery-1', context);
    const consent = await apiClient.consentRecovery('recovery-1', {
      decision: 'approve', expected_state_version: status.state_version,
    }, context);

    expect(status.status).toBe('OPEN');
    expect(consent.recovery.consent_state).toBe('APPROVED');
    expect(requests[0]?.headers.get('Idempotency-Key')).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(requests[0]?.headers.get('X-Project-Token')).toBe('secret-token');
  });

  it('requests RAG Build with the supported ego component', async () => {
    let captured: Request | undefined;
    server.use(http.post('/api/v1/projects/proj-001/builds', async ({ request }) => {
      captured = request;
      return HttpResponse.json({
        job_id: 'job-rag-1', job_type: 'BUILD_SCENARIO', project_id: 'proj-001', subject_hash: 'sha256:variant',
        status: 'QUEUED', idempotency_key: 'idem-rag', attempt: 0, available_at: '2026-08-15T00:00:00Z',
        lease_expires_at: null, lease_owner: null, payload: {}, result: null, failure_class: null,
        correlation_id: 'corr-rag', schema_version: '1.0.0', created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z',
      });
    }));
    const previousCorpusVersion = process.env.NEXT_PUBLIC_SCENARIO_FORGE_CORPUS_VERSION;
    process.env.NEXT_PUBLIC_SCENARIO_FORGE_CORPUS_VERSION = 'chat2scenic-ed0b1f87';

    try {
      await apiClient.createProviderBuild('sha256:variant', 'rag', {
        projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1', idempotencyKey: 'idem-rag',
      }, 'A pedestrian crosses in front of ego on Town05.');
    } finally {
      if (previousCorpusVersion === undefined) delete process.env.NEXT_PUBLIC_SCENARIO_FORGE_CORPUS_VERSION;
      else process.env.NEXT_PUBLIC_SCENARIO_FORGE_CORPUS_VERSION = previousCorpusVersion;
    }

    expect(await captured?.json()).toMatchObject({
      requested_generation_mode: 'rag',
      retrieval_query: {
        project_id: 'proj-001', component: 'E', query: 'A pedestrian crosses in front of ego on Town05.', filters: {},
        corpus_version: 'chat2scenic-ed0b1f87', top_k: 5,
      },
    });
  });

  it('parses additive Build Job deadline, settlement, and resume fields', async () => {
    server.use(http.post('/api/v1/projects/proj-001/builds', () => HttpResponse.json({
      job_id: 'job-baseline-1', job_type: 'BUILD_SCENARIO', project_id: 'proj-001', subject_hash: 'sha256:variant',
      status: 'QUEUED', idempotency_key: 'idem-baseline', attempt: 0, available_at: '2026-08-15T00:00:00Z',
      lease_expires_at: null, lease_owner: null, payload: {}, result: null, failure_class: null,
      correlation_id: 'corr-baseline', schema_version: '1.0.0', created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z',
      deadline_at: '2026-08-15T01:00:00Z', lease_generation: 0, settlement_generation: null,
      settlement_code: null, settled_at: null, worker_resume_key: null, resumable: false,
    })));

    await expect(apiClient.createProviderBuild('sha256:variant', 'baseline', {
      projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1', idempotencyKey: 'idem-baseline',
    })).resolves.toMatchObject({ job_id: 'job-baseline-1', deadline_at: '2026-08-15T01:00:00Z', lease_generation: 0 });
  });

  it('uses the shared Unicode canonicalization vector for content-addressed commands', async () => {
    let captured: Request | undefined;
    server.use(http.post('/api/v1/projects/proj-%E9%81%93%E8%B7%AF/variants/ground', async ({ request }) => {
      captured = request;
      return HttpResponse.json({ variant_id: 'var-1', version: 1, parent_definition_hash: 'sha256:def', parent_definition: null, catalog_version: '1.0.0', content_hash: 'sha256:var', identity: null, bindings: {}, coordinate_semantics: {}, assumptions: [], provenance: {}, original_values: {}, display_values: {}, internal_values: {} });
    }));

    await apiClient.groundVariant({
      definition_id: 'def-é', version: 1,
      catalog_constraints: { '🙂': 'café', 'é': 'composed', 'e\u0301': 'decomposed', '道路': '交差点' },
    }, { projectId: 'proj-道路', projectToken: 'secret-token', correlationId: 'corr-1' });

    expect(captured?.headers.get('Idempotency-Key')).toBe('sha256:63cad44bf1a13d9d958fa855ff4a85329841c8774d2cce6e713b4f792b008f40');
  });
  it('uses project-scoped provider routes and required release headers', async () => {
    let captured: Request | undefined;
    server.use(http.post('/api/v1/projects/proj-001/runs', async ({ request }) => {
      captured = request;
      return HttpResponse.json({
        run: {
          run: { schema_version: '1.0.0', run_id: 'run-1', build_id: 'bld-001', manifest_hash: 'sha256:abc', seed: 17, status: 'queued' },
          job_id: 'job-1', approval_id: 'approval-1', attempt: 0, status: 'queued',
          progress: { phase: 'queued', completed_steps: 0, total_steps: 1 }, sampled_values: {}, versions: null,
          failure: null, cleanup: { outcome: 'not_started', detail: null }, artifact: null, replay_of: null,
        },
        created: true,
      });
    }));

    await apiClient.createRun(
      { build_id: 'bld-001', manifest_hash: 'sha256:abc', seed: 17, status: 'queued' },
      { projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1', idempotencyKey: 'idem-1' },
    );

    expect(captured?.headers.get('X-Project-Token')).toBe('secret-token');
    expect(captured?.headers.get('X-Correlation-ID')).toBe('corr-1');
    expect(captured?.headers.get('Idempotency-Key')).toBe('idem-1');
  });

  it('unwraps FastAPI detail error envelopes', async () => {
    server.use(http.get('/api/v1/projects/proj-001/builds/missing', () => HttpResponse.json({
      detail: {
        schema_version: '1.0.0', failure_class: 'INPUT_OR_CONTRACT', code: 'BUILD_NOT_FOUND',
        message: 'No readable build exists.', retryable: false, correlation_id: 'corr-provider',
      },
    }, { status: 404 })));

    await expect(apiClient.getBuild('missing', {
      projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1',
    })).rejects.toMatchObject({
      status: 404,
      envelope: { code: 'BUILD_NOT_FOUND', correlation_id: 'corr-provider' },
    });
  });

  it('validates the full persisted Build provider response', async () => {
    server.use(http.get('/api/v1/projects/proj-001/builds/bld-001', () => HttpResponse.json({
      build_id: 'bld-001', project_id: 'proj-001', definition_version_id: 'dv-1', definition_id: 'def-1', definition_version: 1,
      variant_id: 'var-1', variant_version: 1, parent_definition_hash: 'sha256:def', variant_hash: 'sha256:var',
      catalog_version: '1.0.0', catalog_reference_id: 'map-1', requested_generation_mode: 'baseline', generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, artifact_references: [], generator_version: 'generator-1',
      model_version: 'model-1', prompt_version: 'prompt-1', component_versions: {}, toolchain_versions: {}, scenic_source: 'param map = "Town05"',
      validation_report: {}, compile_report: {}, sampling_report: {}, repair_history: [], manifest_hash: 'sha256:manifest',
    })));

    const build = await apiClient.getBuild('bld-001', {
      projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-1',
    });

    expect(build).toMatchObject({ project_id: 'proj-001', build_id: 'bld-001', manifest_hash: 'sha256:manifest' });
  });

  it('parses successful responses with the supplied Zod schema', async () => {
    server.use(http.get('/api/v1/builds/bld-001', () => HttpResponse.json({
      schema_version: '1.0.0', build_id: 'bld-001', variant_hash: 'sha256:v',
      generation_mode: 'baseline', manifest_hash: 'sha256:m',
    })));

    const build = await apiClient.getBuild('bld-001');
    expect(build.build_id).toBe('bld-001');
    expect(build.generation_mode).toBe('baseline');
  });

  it('rejects malformed success payloads instead of exposing raw JSON', async () => {
    server.use(http.get('/api/v1/builds/bld-001', () => HttpResponse.json({ build_id: 'bld-001' })));

    await expect(apiClient.getBuild('bld-001')).rejects.toThrow(ApiError);
  });

  it('fails closed when a capability check contains an unsafe alternative reference', async () => {
    server.use(http.post('/api/v1/projects/proj-001/capabilities/check', () => HttpResponse.json({
      operation: 'scenario.capabilities.check', schema_version: '1.0.0', capability_set_version: '1.0.0',
      query_id: 'capability-query:unsafe', scope: { project_id: 'proj-001', actor_ref: 'actor-1' },
      check: 'unsupported', involved_ids: ['overtake'], items: [], missing_fields: [], incompatible_pairs: [],
      safe_alternatives: ['<script>alert(1)</script>'], allowed_next_actions: ['stop'], summary: '', error_code: null,
    })));

    await expect(apiClient.checkCapabilities(
      { projectId: 'proj-001', projectToken: 'secret-token', correlationId: 'corr-capability' },
      { capability_ids: ['overtake'] },
    )).rejects.toMatchObject({
      status: 502,
      envelope: { code: 'ERR_INVALID_CAPABILITY_CHECK_RESPONSE' },
    });
  });

  it('parses error envelopes for non-2xx responses', async () => {
    server.use(http.get('/api/v1/builds/missing', () => HttpResponse.json({
      schema_version: '1.0.0', failure_class: 'INPUT_OR_CONTRACT', code: 'ERR_NOT_FOUND',
      message: 'missing', retryable: false, correlation_id: 'corr-1',
    }, { status: 404 })));

    await expect(apiClient.getBuild('missing')).rejects.toMatchObject({
      envelope: expect.objectContaining({ code: 'ERR_NOT_FOUND', correlation_id: 'corr-1' }),
      status: 404,
    });
  });
});
