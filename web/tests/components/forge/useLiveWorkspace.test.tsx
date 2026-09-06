import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from '../../../src/shared/api/client';
import { buildCorrelationId, pollBuildJob, pollRunEvidence, useLiveWorkspace } from '../../../src/components/forge/useLiveWorkspace';

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>('../../../src/shared/api/client');
  return { ...actual, apiClient: Object.fromEntries(Object.keys(actual.apiClient).map((key) => [key, vi.fn()])) };
});
const definition = (projectId: string, id: string, version = 1) => ({
  request_id: `req-${id}`, job_id: null, job_status: null, correlation_id: `corr-${id}`, definition_version_id: `dv-${id}-${version}`, supersedes: null,
  definition: { schema_version: '1.0.0', project_id: projectId, definition_id: id, version, description: id, content_hash: `sha256:${id}:${version}` },
  claims: [], logical_ir: {}, provenance: {},
});

const runView = {
  run: { schema_version: '1.0.0', run_id: 'run-1', build_id: 'build-1', manifest_hash: 'sha256:manifest', seed: 42, mode: 'smoke' as const },
  job_id: 'job-1', approval_id: 'approval-1', attempt: 0, status: 'queued',
  progress: { phase: 'queued', completed_steps: 0, total_steps: 1 }, sampled_values: {}, versions: null,
  failure: null, cleanup: { outcome: 'not_started', detail: null }, artifact: null, replay_of: null,
};

describe('useLiveWorkspace orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
  });

  it('keeps browser correlation IDs within the persistence limit', () => {
    const correlationId = buildCorrelationId('create-authoring-session');

    expect(correlationId).toMatch(/^web-create-authoring-session-/);
    expect(correlationId.length).toBeLessThanOrEqual(64);
  });

  it('keeps polling a Build job through a worker retry', async () => {
    let calls = 0;
    const final = await pollBuildJob(
      { job_id: 'job-retry', status: 'running', result: null } as never,
      async () => {
        calls += 1;
        return (calls <= 60
          ? { job_id: 'job-retry', status: 'running', result: null }
          : { job_id: 'job-retry', status: 'succeeded', result: { build_id: 'build-after-retry' } }) as never;
      },
      () => true,
      async () => undefined,
    );

    expect(calls).toBe(61);
    expect(final.result?.build_id).toBe('build-after-retry');
  });

  it('polls Run evidence until the terminal snapshot is available, then stops', async () => {
    let calls = 0;
    const final = await pollRunEvidence(
      { status: 'queued', video: false },
      async () => {
        calls += 1;
        return { status: calls === 1 ? 'running' : 'succeeded', video: calls >= 2 };
      },
      (snapshot) => snapshot.status === 'succeeded' && snapshot.video === true,
      () => true,
      async () => undefined,
    );

    expect(calls).toBe(2);
    expect(final).toEqual({ status: 'succeeded', video: true });
  });

  it('bounds Run evidence polling when the provider never reaches a terminal snapshot', async () => {
    let calls = 0;
    const final = await pollRunEvidence(
      { status: 'queued', video: false },
      async () => { calls += 1; return { status: 'running', video: false }; },
      () => false,
      () => true,
      async () => undefined,
      2,
    );

    expect(calls).toBe(2);
    expect(final).toEqual({ status: 'running', video: false });
  });

  it('grounds then dispatches one baseline Build without approving or running', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-a', content_hash: 'sha256:variant-a' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-a', status: 'succeeded', result: { build_id: 'build-a' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-a', manifest_hash: 'sha256:manifest-a', scenic_source: 'param map = "Town05"' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([] as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.groundAndBuild('baseline'));

    expect(apiClient.groundVariant).toHaveBeenCalledOnce();
    expect(apiClient.createProviderBuild).toHaveBeenCalledWith('sha256:variant-a', 'baseline', expect.objectContaining({ projectId: 'project-a' }));
    expect(apiClient.approveBuild).not.toHaveBeenCalled();
    expect(apiClient.createRun).not.toHaveBeenCalled();
    expect(result.current.state.build?.build_id).toBe('build-a');
    expect(result.current.state.variant?.content_hash).toBe('sha256:variant-a');
  });

  it('grounds then dispatches a RAG Build with the selected Definition description as retrieval provenance', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-a', content_hash: 'sha256:variant-a' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-rag', status: 'succeeded', result: { build_id: 'build-rag' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-rag', manifest_hash: 'sha256:manifest-rag', scenic_source: 'param map = "Town05"' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([] as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.groundAndBuild('rag'));

    expect(apiClient.createProviderBuild).toHaveBeenCalledWith(
      'sha256:variant-a', 'rag', expect.objectContaining({ projectId: 'project-a' }), 'definition-a',
    );
    expect(apiClient.approveBuild).not.toHaveBeenCalled();
    expect(apiClient.createRun).not.toHaveBeenCalled();
  });

  it('rebuilds in RAG mode with selected Definition retrieval provenance', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-a', content_hash: 'sha256:variant-a' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-rag-rebuild', status: 'succeeded', result: { build_id: 'build-rag-rebuild' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-rag-rebuild', manifest_hash: 'sha256:manifest-rag-rebuild', scenic_source: 'param map = "Town05"' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([] as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.ground());
    await act(() => result.current.build('rag'));

    expect(apiClient.createProviderBuild).toHaveBeenCalledWith(
      'sha256:variant-a', 'rag', expect.objectContaining({ projectId: 'project-a' }), 'definition-a',
    );
  });

  it('stops before Build and persists the pending recovery after a recoverable v1 failure', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockRejectedValue(new ApiError(409, {
      schema_version: '1.0.0', failure_class: 'INPUT_OR_CONTRACT', code: 'UNSUPPORTED_SEMANTICS',
      message: 'The published definition needs explicit recovery before it can be grounded.', retryable: false,
      correlation_id: 'corr-recovery', recovery_required: true, reason_code: 'UNSUPPORTED_SEMANTICS',
      source: { project_id: 'project-a', definition_id: 'definition-a', definition_version: 1, definition_version_id: 'dv-definition-a-1', content_hash: 'sha256:definition-a:1' },
      recovery: {
        recovery_id: 'recovery-1', project_id: 'project-a', actor_ref: 'actor-1',
        source_definition_version_id: 'dv-definition-a-1', source_definition_id: 'definition-a', source_version: 1,
        source_content_hash: 'sha256:definition-a:1', recovery_session_id: 'session-recovery-1', requested_target: 'buildable',
        status: 'OPEN', consent_state: 'PENDING', acquisition_action_key: 'ground-1', acquisition_action_digest: 'sha256:acquire',
        consent_action_key: null, consent_action_digest: null, publish_action_key: null, publish_action_digest: null,
        successor_definition_version_id: null, state_version: 1, correlation_id: 'corr-recovery', reason_code: 'UNSUPPORTED_SEMANTICS',
        terminal_outcome: null, created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z', schema_version: '1.0.0',
      }, allowed_actions: ['approve', 'cancel', 'refresh'],
    } as never));

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.groundAndBuild('baseline'));

    expect(apiClient.createProviderBuild).not.toHaveBeenCalled();
    expect(result.current.state.recovery?.recovery.recovery_id).toBe('recovery-1');
    expect(result.current.state.selectedDefinition?.definition.version).toBe(1);
    expect(window.localStorage.getItem('scenario-forge:recovery:project-a')).toBe('recovery-1');
  });

  it('restores a durable recovery lock on restart without retrying v1 grounding', async () => {
    const lock = {
      recovery_id: 'recovery-restart', project_id: 'project-a', actor_ref: 'actor-1',
      source_definition_version_id: 'dv-definition-a-1', source_definition_id: 'definition-a', source_version: 1,
      source_content_hash: 'sha256:definition-a:1', recovery_session_id: 'session-recovery', requested_target: 'buildable',
      status: 'OPEN', consent_state: 'PENDING', acquisition_action_key: 'ground-1', acquisition_action_digest: 'sha256:acquire',
      consent_action_key: null, consent_action_digest: null, publish_action_key: null, publish_action_digest: null,
      successor_definition_version_id: null, state_version: 3, correlation_id: 'corr-recovery', reason_code: 'UNSUPPORTED_SEMANTICS',
      terminal_outcome: null, created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z', schema_version: '1.0.0',
    };
    window.localStorage.setItem('scenario-forge:recovery:project-a', 'recovery-restart');
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.getRecovery).mockResolvedValue(lock as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    expect(apiClient.getRecovery).toHaveBeenCalledWith('recovery-restart', expect.objectContaining({ projectId: 'project-a' }));
    expect(apiClient.groundVariant).not.toHaveBeenCalled();
    expect(result.current.state.recovery?.recovery.state_version).toBe(3);
    expect(result.current.state.status).toBe('Recovery is waiting for consent');
  });

  it('records cancel consent with the current state version and keeps v1 selected', async () => {
    const lock = {
      recovery_id: 'recovery-cancel', project_id: 'project-a', actor_ref: 'actor-1',
      source_definition_version_id: 'dv-definition-a-1', source_definition_id: 'definition-a', source_version: 1,
      source_content_hash: 'sha256:definition-a:1', recovery_session_id: 'session-recovery', requested_target: 'buildable',
      status: 'OPEN', consent_state: 'PENDING', acquisition_action_key: 'ground-1', acquisition_action_digest: 'sha256:acquire',
      consent_action_key: null, consent_action_digest: null, publish_action_key: null, publish_action_digest: null,
      successor_definition_version_id: null, state_version: 4, correlation_id: 'corr-recovery', reason_code: 'UNSUPPORTED_SEMANTICS',
      terminal_outcome: null, created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z', schema_version: '1.0.0',
    };
    const cancelled = { ...lock, status: 'CANCELLED', consent_state: 'DECLINED', state_version: 5, terminal_outcome: 'CANCELLED' };
    window.localStorage.setItem('scenario-forge:recovery:project-a', 'recovery-cancel');
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.getRecovery).mockResolvedValue(lock as never);
    vi.mocked(apiClient.cancelRecovery).mockResolvedValue({ recovery: cancelled, replayed: false } as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.consentRecovery('cancel'));

    expect(apiClient.cancelRecovery).toHaveBeenCalledWith(
      'recovery-cancel', 4, expect.objectContaining({ projectId: 'project-a' }),
    );
    expect(result.current.state.selectedDefinition?.definition.version).toBe(1);
    expect(result.current.state.recovery?.recovery.status).toBe('CANCELLED');
    expect(result.current.state.status).toBe('Recovery cancelled; v1 remains unchanged');
    expect(apiClient.createProviderBuild).not.toHaveBeenCalled();
  });

  it('ignores a late project response after the session changes', async () => {
    let releaseA!: (value: unknown) => void;
    vi.mocked(apiClient.listDefinitions)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseA = resolve; }) as never)
      .mockResolvedValueOnce({ project_id: 'project-b', items: [definition('project-b', 'definition-b')], next_cursor: null } as never);
    const { result } = renderHook(() => useLiveWorkspace());

    let first!: Promise<void>;
    act(() => { first = result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }); });
    await act(() => result.current.connect({ projectId: 'project-b', projectToken: 'token-b' }));
    await act(async () => {
      releaseA({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null });
      await first;
    });

    expect(result.current.state.session?.projectId).toBe('project-b');
    expect(result.current.state.definitions[0].definition.definition_id).toBe('definition-b');
  });

  it('ignores a late provider failure after the session changes', async () => {
    let rejectA!: (error: unknown) => void;
    vi.mocked(apiClient.listDefinitions)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectA = reject; }) as never)
      .mockResolvedValueOnce({ project_id: 'project-b', items: [definition('project-b', 'definition-b')], next_cursor: null } as never);
    const { result } = renderHook(() => useLiveWorkspace());

    let first!: Promise<void>;
    act(() => { first = result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }); });
    await act(() => result.current.connect({ projectId: 'project-b', projectToken: 'token-b' }));
    await act(async () => { rejectA(new Error('late project-a failure')); await first; });

    expect(result.current.state.session?.projectId).toBe('project-b');
    expect(result.current.state.stage).toBe('ready');
    expect(result.current.state.error).toBeNull();
  });

  it('disconnects an unauthorized session so the user can enter replacement credentials', async () => {
    vi.mocked(apiClient.listDefinitions).mockRejectedValue(new ApiError(403, {
      schema_version: '1.0.0', failure_class: 'SECURITY_OR_POLICY', code: 'REGISTRY_UNAUTHORIZED',
      message: 'The requested registry resource is not authorized for this project.', retryable: false,
      correlation_id: 'corr-unauthorized',
    }));
    const { result } = renderHook(() => useLiveWorkspace());

    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'expired-token' }));
    expect(result.current.state.stage).toBe('error');
    expect(result.current.state.session?.projectId).toBe('project-a');

    act(() => result.current.disconnect());

    expect(result.current.state).toMatchObject({
      session: null,
      stage: 'idle',
      status: 'Connect a project session',
      error: null,
      definitions: [],
      registry: [],
    });
  });

  it('ignores a late project response after the user disconnects', async () => {
    let release!: (value: unknown) => void;
    vi.mocked(apiClient.listDefinitions).mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }) as never,
    );
    const { result } = renderHook(() => useLiveWorkspace());

    let connection!: Promise<void>;
    act(() => { connection = result.current.connect({ projectId: 'project-a', projectToken: 'expired-token' }); });
    act(() => result.current.disconnect());
    await act(async () => {
      release({ project_id: 'project-a', items: [definition('project-a', 'definition-stale')], next_cursor: null });
      await connection;
    });

    expect(result.current.state).toMatchObject({
      session: null,
      stage: 'idle',
      status: 'Connect a project session',
      error: null,
      definitions: [],
      registry: [],
    });
  });

  it('does not continue a Build or write its result after the project changes', async () => {
    let releaseBuild!: (value: unknown) => void;
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-b', items: [definition('project-b', 'definition-b')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-a', content_hash: 'sha256:variant-a' } as never);
    vi.mocked(apiClient.createProviderBuild).mockImplementationOnce(
      () => new Promise((resolve) => { releaseBuild = resolve; }) as never,
    );
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.ground());

    let build!: Promise<void>;
    act(() => { build = result.current.build('baseline'); });
    await act(() => result.current.connect({ projectId: 'project-b', projectToken: 'token-b' }));
    await act(async () => {
      releaseBuild({ job_id: 'job-a', status: 'succeeded', result: { build_id: 'build-a' } });
      await build;
    });

    expect(result.current.state.session?.projectId).toBe('project-b');
    expect(result.current.state.build).toBeNull();
    expect(apiClient.getProviderBuild).not.toHaveBeenCalled();
  });

  it('does not continue lineage hydration with a new project context', async () => {
    let releaseBuild!: (value: unknown) => void;
    const lineage = {
      project_id: 'project-a', definition_version_id: 'dv-definition-a-1', definition_id: 'definition-a', definition_version: 1,
      definition_hash: 'sha256:definition-a:1', variant_id: 'variant-a', variant_version: 1, variant_hash: 'sha256:variant-a',
      build_id: 'build-a', manifest_hash: 'sha256:manifest-a', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-a', run_seed: 42, run_status: 'succeeded',
      runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
      artifact_ids: ['artifact-a'], artifact_states: { 'artifact-a': 'published' }, evaluation_id: 'evaluation-a', evaluation_outcome: 'pass',
      evaluation_details: {}, failure_code: null, source_version: '1.0.0',
    };
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-b', items: [definition('project-b', 'definition-b')], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [lineage], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-b', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getProviderBuild).mockImplementationOnce(
      () => new Promise((resolve) => { releaseBuild = resolve; }) as never,
    );
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.getRunView).mockResolvedValue(runView as never);
    const { result } = renderHook(() => useLiveWorkspace());

    let first!: Promise<void>;
    act(() => { first = result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }); });
    await waitFor(() => expect(apiClient.getProviderBuild).toHaveBeenCalled());
    await act(() => result.current.connect({ projectId: 'project-b', projectToken: 'token-b' }));
    await act(async () => {
      releaseBuild({ build_id: 'build-a', manifest_hash: 'sha256:manifest-a' });
      await first;
    });

    expect(apiClient.getRunView).not.toHaveBeenCalled();
    expect(result.current.state.session?.projectId).toBe('project-b');
    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('definition-b');
  });

  it('does not let a late refresh overwrite a newer Definition selection', async () => {
    let releaseBuild!: (value: unknown) => void;
    const definitions = [definition('project-a', 'definition-a'), definition('project-a', 'definition-b')];
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: definitions, next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [], next_cursor: null } as never)
      .mockResolvedValueOnce({
        project_id: 'project-a',
        items: [{
          definition_id: 'definition-a', definition_version: 1, variant_version: 1,
          build_id: 'build-a', run_id: null, artifact_ids: [],
        }],
        next_cursor: null,
      } as never);
    vi.mocked(apiClient.getProviderBuild).mockImplementationOnce(
      () => new Promise((resolve) => { releaseBuild = resolve; }) as never,
    );
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    let refresh!: Promise<boolean>;
    act(() => { refresh = result.current.refresh(); });
    await waitFor(() => expect(apiClient.getProviderBuild).toHaveBeenCalledWith('build-a', expect.any(Object)));
    await act(() => result.current.selectDefinition('definition-b'));
    await act(async () => {
      releaseBuild({ build_id: 'build-a', manifest_hash: 'sha256:manifest-a' });
      await refresh;
    });

    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('definition-b');
    expect(result.current.state.build).toBeNull();
  });

  it('does not let an older refresh success overwrite a newer refresh', async () => {
    let releaseOld!: (value: unknown) => void;
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'initial')], next_cursor: null } as never)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOld = resolve; }) as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'newer')], next_cursor: null } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    let oldRefresh!: Promise<boolean>;
    act(() => { oldRefresh = result.current.refresh(); });
    await waitFor(() => expect(apiClient.listDefinitions).toHaveBeenCalledTimes(2));
    await act(() => result.current.refresh());
    await act(async () => {
      releaseOld({ project_id: 'project-a', items: [definition('project-a', 'older')], next_cursor: null });
      await oldRefresh;
    });

    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('newer');
  });

  it('does not let an older refresh failure replace a newer success', async () => {
    let rejectOld!: (error: unknown) => void;
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'initial')], next_cursor: null } as never)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }) as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'newer')], next_cursor: null } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    let oldRefresh!: Promise<boolean>;
    act(() => { oldRefresh = result.current.refresh(); });
    await waitFor(() => expect(apiClient.listDefinitions).toHaveBeenCalledTimes(2));
    await act(() => result.current.refresh());
    await act(async () => { rejectOld(new Error('stale refresh failure')); await oldRefresh; });

    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('newer');
    expect(result.current.state.stage).toBe('ready');
    expect(result.current.state.error).toBeNull();
  });

  it('lets a refresh supersede pending Definition hydration in the same session', async () => {
    let releaseBuild!: (value: unknown) => void;
    const definitions = [definition('project-a', 'definition-a'), definition('project-a', 'definition-b')];
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: definitions, next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry)
      .mockResolvedValueOnce({
        project_id: 'project-a',
        items: [{
          definition_id: 'definition-b', definition_version: 1, variant_version: 1,
          build_id: 'build-b', run_id: null, artifact_ids: [],
        }],
        next_cursor: null,
      } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getProviderBuild).mockImplementationOnce(
      () => new Promise((resolve) => { releaseBuild = resolve; }) as never,
    );
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    let selection!: Promise<void>;
    act(() => { selection = result.current.selectDefinition('definition-b'); });
    await waitFor(() => expect(apiClient.getProviderBuild).toHaveBeenCalledWith('build-b', expect.any(Object)));
    await act(() => result.current.refresh());
    await act(async () => {
      releaseBuild({ build_id: 'build-b', manifest_hash: 'sha256:manifest-b' });
      await selection;
    });

    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('definition-b');
    expect(result.current.state.build).toBeNull();
  });

  it('loads every Registry page before presenting project lineage', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [{ build_id: 'build-1' }], next_cursor: 'cursor-2' } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [{ build_id: 'build-2' }], next_cursor: null } as never);
    const { result } = renderHook(() => useLiveWorkspace());

    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    expect(result.current.state.registry.map((item) => item.build_id)).toEqual(['build-1', 'build-2']);
    expect(apiClient.getRegistry).toHaveBeenNthCalledWith(2, undefined, expect.any(Object), 'cursor-2');
  });

  it('prefers a succeeded Run over a failed Run when first connecting to the same Build', async () => {
    const sharedLineage = {
      project_id: 'project-a', definition_version_id: 'dv-definition-a-1', definition_id: 'definition-a', definition_version: 1,
      definition_hash: 'sha256:definition-a:1', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
      build_id: 'build-1', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, run_seed: 42,
      runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
      artifact_ids: [], artifact_states: {}, evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: null, source_version: '1.0.0',
    };
    const failed = { ...sharedLineage, run_id: 'run-old', run_status: 'failed', failure_code: 'CARLA_UNAVAILABLE' };
    const succeeded = { ...sharedLineage, run_id: 'run-new', run_status: 'succeeded' };
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [failed, succeeded], next_cursor: null } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-1', manifest_hash: 'sha256:manifest' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.getRunView).mockImplementation(async (runId) => ({
      ...runView,
      status: runId === 'run-new' ? 'succeeded' : 'failed',
      run: { ...runView.run, run_id: runId, build_id: 'build-1' },
    }) as never);
    vi.mocked(apiClient.getEvaluation).mockResolvedValue({ evaluation: { outcome: 'pass' }, report: { outcome: 'pass' } } as never);
    const { result } = renderHook(() => useLiveWorkspace());

    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    expect(result.current.state.run?.run.run_id).toBe('run-new');
    expect(apiClient.getRunView).toHaveBeenCalledWith('run-new', expect.any(Object));
  });

  it('restores the saved Definition and Run with its video after a reload', async () => {
    const current = {
      project_id: 'project-a', definition_version_id: 'dv-definition-current-1', definition_id: 'definition-current', definition_version: 1,
      definition_hash: 'sha256:definition-current:1', variant_id: 'variant-current', variant_version: 1, variant_hash: 'sha256:variant-current',
      build_id: 'build-current', manifest_hash: 'sha256:manifest-current', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-current', run_seed: 42, run_status: 'succeeded',
      runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
      artifact_ids: ['run-video-current'], artifact_states: { 'run-video-current': 'published' }, evaluation_id: 'evaluation-current', evaluation_outcome: 'pass',
      evaluation_details: {}, failure_code: null, source_version: '1.0.0',
    };
    window.localStorage.setItem(
      'scenario-forge:selection:project-a',
      JSON.stringify({ definitionId: 'definition-current', runId: 'run-current' }),
    );
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({
      project_id: 'project-a',
      items: [definition('project-a', 'definition-old'), definition('project-a', 'definition-current')],
      next_cursor: null,
    } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [current], next_cursor: null } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-current', manifest_hash: 'sha256:manifest-current' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.getRunView).mockResolvedValue({ ...runView, status: 'succeeded', run: { ...runView.run, run_id: 'run-current', build_id: 'build-current' } } as never);
    vi.mocked(apiClient.getEvaluation).mockResolvedValue({ evaluation: { outcome: 'pass' }, report: { outcome: 'pass' } } as never);
    vi.mocked(apiClient.getRegistryArtifact).mockResolvedValue({ artifact_id: 'run-video-current', status: 'published', public_uri: '/video-current.mp4' } as never);
    const { result } = renderHook(() => useLiveWorkspace());

    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('definition-current');
    expect(result.current.state.run?.run.run_id).toBe('run-current');
    expect(result.current.state.artifactOutcomes).toEqual([{ artifact_id: 'run-video-current', status: 'published', public_uri: '/video-current.mp4' }]);
  });

  it('retains the Run returned by dispatch instead of depending on immediate Registry projection', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-1', content_hash: 'sha256:variant' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'build-job-1', status: 'succeeded', result: { build_id: 'build-1' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-1', manifest_hash: 'sha256:manifest' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.approveBuild).mockResolvedValue({
      approval_id: 'approval-1', project_id: 'project-a', build_id: 'build-1', manifest_hash: 'sha256:manifest',
      reviewer_id: 'reviewer', decision: 'approved', created_at: '2026-08-14T00:00:00Z', invalidated: false, invalidation_reason: null,
    } as never);
    vi.mocked(apiClient.createRun).mockResolvedValue({ ...runView.run, status: runView.status } as never);
    vi.mocked(apiClient.getRunView).mockResolvedValue(runView as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.ground());
    await act(() => result.current.build('baseline'));
    await act(() => result.current.approve());

    await act(() => result.current.dispatchRun('smoke', 42));

    expect(result.current.state.run?.run.run_id).toBe('run-1');
    expect(result.current.state.status).toContain('run-1');
  });

  it('returns a refusal when approval becomes invalid before dispatch', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-1', content_hash: 'sha256:variant' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-1', status: 'succeeded', result: { build_id: 'build-1' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-1', manifest_hash: 'sha256:manifest' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([] as never);
    vi.mocked(apiClient.approveBuild).mockResolvedValue({ approval_id: 'approval-1', project_id: 'project-a', build_id: 'build-1', manifest_hash: 'sha256:manifest', reviewer_id: 'reviewer', decision: 'approved', created_at: '2026-08-14T00:00:00Z', invalidated: true, invalidation_reason: 'superseded' } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.ground());
    await act(() => result.current.build('baseline'));
    await act(() => result.current.approve());

    await expect(result.current.dispatchRun('smoke', 42)).resolves.toBe(false);
    expect(apiClient.createRun).not.toHaveBeenCalled();
  });

  it('refreshes dispatched Run status and signed video evidence without a manual reload', async () => {
    vi.useFakeTimers();
    try {
      const lineage = {
        project_id: 'project-a', definition_version_id: 'dv-definition-a-1', definition_id: 'definition-a', definition_version: 1,
        definition_hash: 'sha256:definition-a:1', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
        build_id: 'build-1', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
        fallback_used: false, retrieval_id: null, retrieval_hash: null, run_seed: 42,
        runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
        artifact_ids: ['run-video-1'], artifact_states: { 'run-video-1': 'published' }, evaluation_id: 'evaluation-1', evaluation_outcome: 'pass',
        evaluation_details: {}, failure_code: null, source_version: '1.0.0', run_id: 'run-1', run_status: 'succeeded',
      };
      const buildOnlyLineage = { ...lineage, artifact_ids: ['build-artifact-1'], artifact_states: { 'build-artifact-1': 'published' } };
      const succeeded = { ...runView, status: 'succeeded', run: { ...runView.run, run_id: 'run-1' } };
      vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
      vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-1', content_hash: 'sha256:variant' } as never);
      vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-1', status: 'succeeded', result: { build_id: 'build-1' } } as never);
      vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-1', manifest_hash: 'sha256:manifest' } as never);
      vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([] as never);
      vi.mocked(apiClient.approveBuild).mockResolvedValue({ approval_id: 'approval-1', project_id: 'project-a', build_id: 'build-1', manifest_hash: 'sha256:manifest', reviewer_id: 'reviewer', decision: 'approved', created_at: '2026-08-14T00:00:00Z', invalidated: false, invalidation_reason: null } as never);
      vi.mocked(apiClient.createRun).mockResolvedValue({ ...runView.run, run_id: 'run-1', status: 'queued' } as never);
      vi.mocked(apiClient.getRunView)
        .mockResolvedValueOnce({ ...runView, run: { ...runView.run, run_id: 'run-1' } } as never)
        .mockResolvedValue(succeeded as never);
      vi.mocked(apiClient.getEvaluation).mockResolvedValue({ evaluation: { outcome: 'pass' }, report: { outcome: 'pass' } } as never);
      vi.mocked(apiClient.getRegistry).mockResolvedValueOnce({ project_id: 'project-a', items: [], next_cursor: null } as never)
        .mockResolvedValueOnce({ project_id: 'project-a', items: [buildOnlyLineage], next_cursor: null } as never)
        .mockResolvedValue({ project_id: 'project-a', items: [lineage], next_cursor: null } as never);
      vi.mocked(apiClient.getRegistryArtifact)
        .mockResolvedValueOnce({ artifact_id: 'build-artifact-1', status: 'published', public_uri: null } as never)
        .mockResolvedValue({ artifact_id: 'run-video-1', status: 'published', public_uri: '/signed/run-video-1?signature=signed' } as never);

      const { result } = renderHook(() => useLiveWorkspace());
      await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
      await act(() => result.current.ground());
      await act(() => result.current.build('baseline'));
      await act(() => result.current.approve());
      await act(() => result.current.dispatchRun('smoke', 42));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(result.current.state.run?.status).toBe('succeeded');

      expect(apiClient.getRegistryArtifact).toHaveBeenCalledWith('run-video-1', expect.any(Object));
      expect(result.current.state.artifactOutcomes).toEqual([{ artifact_id: 'run-video-1', status: 'published', public_uri: '/signed/run-video-1?signature=signed' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a dispatched Run selected when refresh returns an older Run for the same Build', async () => {
    const oldLineage = {
      project_id: 'project-a', definition_version_id: 'dv-definition-a-1', definition_id: 'definition-a', definition_version: 1,
      definition_hash: 'sha256:definition-a:1', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
      build_id: 'build-1', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-old', run_seed: 42, run_status: 'failed',
      runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
      artifact_ids: [], artifact_states: {}, evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: 'CARLA_UNAVAILABLE', source_version: '1.0.0',
    };
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-1', content_hash: 'sha256:variant' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-1', status: 'succeeded', result: { build_id: 'build-1' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-1', manifest_hash: 'sha256:manifest' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.approveBuild).mockResolvedValue({ approval_id: 'approval-1', project_id: 'project-a', build_id: 'build-1', manifest_hash: 'sha256:manifest', reviewer_id: 'reviewer', decision: 'approved', created_at: '2026-08-14T00:00:00Z', invalidated: false, invalidation_reason: null } as never);
    vi.mocked(apiClient.createRun).mockResolvedValue({ ...runView.run, run_id: 'run-new', status: 'queued' } as never);
    vi.mocked(apiClient.getRunView)
      .mockResolvedValueOnce({ ...runView, run: { ...runView.run, run_id: 'run-new' } } as never)
      .mockResolvedValue({ ...runView, status: 'failed', run: { ...runView.run, run_id: 'run-old' } } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.ground());
    await act(() => result.current.build('baseline'));
    await act(() => result.current.approve());
    await act(() => result.current.dispatchRun('full', 42));
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [oldLineage], next_cursor: null } as never);

    await act(() => result.current.refresh());

    expect(result.current.state.run?.run.run_id).toBe('run-new');
  });

  it('replaces a queued Run snapshot when that same Run is persisted with video evidence', async () => {
    const completedLineage = {
      project_id: 'project-a', definition_version_id: 'dv-definition-a-1', definition_id: 'definition-a', definition_version: 1,
      definition_hash: 'sha256:definition-a:1', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
      build_id: 'build-1', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-new', run_seed: 42, run_status: 'succeeded',
      runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
      artifact_ids: ['run-video-new'], artifact_states: { 'run-video-new': 'published' }, evaluation_id: null, evaluation_outcome: null,
      evaluation_details: {}, failure_code: null, source_version: '1.0.0',
    };
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-1', manifest_hash: 'sha256:manifest' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.getRunView)
      .mockResolvedValueOnce({ ...runView, status: 'queued', run: { ...runView.run, run_id: 'run-new' } } as never)
      .mockResolvedValueOnce({ ...runView, status: 'succeeded', run: { ...runView.run, run_id: 'run-new' } } as never);
    vi.mocked(apiClient.getEvaluation).mockResolvedValue({ evaluation: { outcome: 'pass' }, report: { outcome: 'pass' } } as never);
    vi.mocked(apiClient.getRegistryArtifact).mockResolvedValue({ artifact_id: 'run-video-new', status: 'published', public_uri: '/video.mp4' } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.loadRun('run-new'));
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [completedLineage], next_cursor: null } as never);

    await act(() => result.current.refresh());

    expect(result.current.state.run?.status).toBe('succeeded');
    expect(result.current.state.artifactOutcomes).toEqual([{ artifact_id: 'run-video-new', status: 'published', public_uri: '/video.mp4' }]);
  });

  it('clears exact-manifest state after a Definition edit and after a replacement Build', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 1)], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 2)], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-1', content_hash: 'sha256:variant' } as never);
    vi.mocked(apiClient.createProviderBuild)
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'succeeded', result: { build_id: 'build-1' } } as never)
      .mockResolvedValueOnce({ job_id: 'job-2', status: 'succeeded', result: { build_id: 'build-2' } } as never);
    vi.mocked(apiClient.getProviderBuild)
      .mockResolvedValueOnce({ build_id: 'build-1', manifest_hash: 'sha256:manifest-1' } as never)
      .mockResolvedValueOnce({ build_id: 'build-2', manifest_hash: 'sha256:manifest-2' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.approveBuild).mockResolvedValue({
      approval_id: 'approval-1', project_id: 'project-a', build_id: 'build-1', manifest_hash: 'sha256:manifest-1',
      reviewer_id: 'reviewer', decision: 'approved', created_at: '2026-08-14T00:00:00Z', invalidated: false, invalidation_reason: null,
    } as never);
    vi.mocked(apiClient.patchProviderDefinition).mockResolvedValue(definition('project-a', 'definition-a', 2) as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.ground());
    await act(() => result.current.build('baseline'));
    await act(() => result.current.approve());

    await act(() => result.current.build('rag'));
    expect(result.current.state.build?.build_id).toBe('build-2');
    expect(result.current.state.approval).toBeNull();

    await act(() => result.current.patchDefinition('definition-a updated'));
    expect(result.current.state.selectedDefinition?.definition.version).toBe(2);
    expect(result.current.state.variant).toBeNull();
    expect(result.current.state.build).toBeNull();
    expect(result.current.state.approval).toBeNull();
    expect(result.current.state.run).toBeNull();
  });

  it('publishes closed Structured edits with the selected CAS version and rehydrates the successor', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 1)], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 2)], next_cursor: null } as never);
    vi.mocked(apiClient.patchProviderDefinition).mockResolvedValue(definition('project-a', 'definition-a', 2) as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.publishDefinitionEdits([
      { path: 'environment.weather', value: 'clear' },
    ]));

    expect(apiClient.patchProviderDefinition).toHaveBeenCalledWith(
      'definition-a', null, 1, expect.objectContaining({ projectId: 'project-a' }),
      [{ path: 'environment.weather', value: 'clear' }],
    );
    expect(result.current.state.selectedDefinition?.definition.version).toBe(2);
    expect(result.current.state.variant).toBeNull();
    expect(result.current.state.build).toBeNull();
  });

  it('reports refresh failure after a patch instead of claiming it published', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 1)], next_cursor: null } as never)
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    vi.mocked(apiClient.patchProviderDefinition).mockResolvedValue(definition('project-a', 'definition-a', 2) as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    const published = await act(() => result.current.publishDefinitionEdits([
      { path: 'environment.weather', value: 'clear' },
    ]));

    expect(published).toBe(false);
    expect(result.current.state.status).toBe('Request failed');
    expect(result.current.state.error).toContain('refresh unavailable');
  });

  it('does not claim success when refresh cannot reselect the returned successor', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 1)], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 1)], next_cursor: null } as never);
    vi.mocked(apiClient.patchProviderDefinition).mockResolvedValue(definition('project-a', 'definition-a', 2) as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    const published = await act(() => result.current.publishDefinitionEdits([
      { path: 'environment.weather', value: 'clear' },
    ]));

    expect(published).toBe(false);
    expect(result.current.state.status).toBe('Request failed');
    expect(result.current.state.error).toContain('successor is not visible');
  });

  it('invalidates old downstream state and retries refresh without duplicating a successful patch', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 1)], next_cursor: null } as never)
      .mockRejectedValueOnce(new Error('refresh unavailable'))
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a', 2)], next_cursor: null } as never);
    vi.mocked(apiClient.patchProviderDefinition).mockResolvedValue(definition('project-a', 'definition-a', 2) as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.publishDefinitionEdits([
      { path: 'environment.weather', value: 'clear' },
    ]));

    expect(apiClient.patchProviderDefinition).toHaveBeenCalledTimes(1);
    expect(result.current.state.variant).toBeNull();
    expect(result.current.state.build).toBeNull();
    expect(result.current.state.run).toBeNull();
    expect(result.current.state.error).toContain('refresh');
    expect(result.current.state.definitionRefreshRequired).toBe(true);

    await act(() => result.current.publishDefinitionEdits([
      { path: 'environment.weather', value: 'clear' },
    ]));

    expect(apiClient.patchProviderDefinition).toHaveBeenCalledTimes(1);
    expect(result.current.state.selectedDefinition?.definition.version).toBe(2);
    expect(result.current.state.definitionRefreshRequired).toBe(false);
  });

  it('hydrates exact existing Build, Run, Evaluation, and artifacts on initial connection', async () => {
    const existing = {
      project_id: 'project-a', definition_version_id: 'dv-definition-a-1', definition_id: 'definition-a', definition_version: 1,
      definition_hash: 'sha256:definition-a:1', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
      build_id: 'build-existing', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-existing', run_seed: 42, run_status: 'succeeded',
      runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
      artifact_ids: ['artifact-1'], artifact_states: { 'artifact-1': 'published' }, evaluation_id: 'evaluation-1', evaluation_outcome: 'pass',
      evaluation_details: {}, failure_code: null, source_version: '1.0.0',
    };
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [existing], next_cursor: null } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-existing', manifest_hash: 'sha256:manifest' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([{ artifact_id: 'artifact-1' }] as never);
    vi.mocked(apiClient.getRunView).mockResolvedValue({ ...runView, status: 'succeeded', run: { ...runView.run, run_id: 'run-existing' } } as never);
    vi.mocked(apiClient.getEvaluation).mockResolvedValue({ evaluation: { outcome: 'pass' }, report: { outcome: 'pass' } } as never);
    vi.mocked(apiClient.getRegistryArtifact).mockResolvedValue({ artifact_id: 'artifact-1', status: 'published' } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    expect(apiClient.getProviderBuild).toHaveBeenCalledWith('build-existing', expect.objectContaining({ projectId: 'project-a' }));
    expect(apiClient.getBuildArtifacts).toHaveBeenCalledWith('build-existing', expect.objectContaining({ projectId: 'project-a' }));
    expect(result.current.state.build?.build_id).toBe('build-existing');
    expect(result.current.state.run?.run.run_id).toBe('run-existing');
    expect(result.current.state.evaluation?.evaluation.outcome).toBe('pass');
    expect(result.current.state.artifacts).toEqual([{ artifact_id: 'artifact-1' }]);
    expect(result.current.state.artifactOutcomes).toEqual([{ artifact_id: 'artifact-1', status: 'published' }]);
  });

  it('clears previous Evaluation and artifact evidence when a new Run is dispatched', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'variant-1', content_hash: 'sha256:variant' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-1', status: 'succeeded', result: { build_id: 'build-1' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ build_id: 'build-1', manifest_hash: 'sha256:manifest' } as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([]);
    vi.mocked(apiClient.approveBuild).mockResolvedValue({
      approval_id: 'approval-1', project_id: 'project-a', build_id: 'build-1', manifest_hash: 'sha256:manifest',
      reviewer_id: 'reviewer', decision: 'approved', created_at: '2026-08-14T00:00:00Z', invalidated: false, invalidation_reason: null,
    } as never);
    vi.mocked(apiClient.getRunView)
      .mockResolvedValueOnce({ ...runView, status: 'succeeded', run: { ...runView.run, run_id: 'run-old' } } as never)
      .mockResolvedValueOnce({ ...runView, status: 'queued', run: { ...runView.run, run_id: 'run-new' } } as never);
    vi.mocked(apiClient.getEvaluation).mockResolvedValue({ evaluation: { outcome: 'pass' }, report: { outcome: 'pass' } } as never);
    vi.mocked(apiClient.createRun).mockResolvedValue({ ...runView.run, run_id: 'run-new', status: 'queued' } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.ground());
    await act(() => result.current.build('baseline'));
    await act(() => result.current.approve());
    await act(() => result.current.loadRun('run-old'));
    expect(result.current.state.evaluation).not.toBeNull();

    await act(() => result.current.dispatchRun('smoke', 42));

    expect(result.current.state.run?.run.run_id).toBe('run-new');
    expect(result.current.state.evaluation).toBeNull();
    expect(result.current.state.artifactOutcomes).toEqual([]);
  });

  it('surfaces evaluation infrastructure errors but treats 404 as unavailable', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getRunView).mockResolvedValue({ ...runView, status: 'succeeded' } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    vi.mocked(apiClient.getEvaluation).mockRejectedValueOnce(new ApiError(503, {
      schema_version: '1.0.0', failure_class: 'INFRASTRUCTURE', code: 'EVALUATION_DOWN', message: 'Evaluation unavailable', retryable: true, correlation_id: 'corr-eval',
    }));

    await act(() => result.current.loadRun('run-1'));
    expect(result.current.state.error).toContain('Evaluation unavailable');

    vi.mocked(apiClient.getEvaluation).mockRejectedValueOnce(new ApiError(404, {
      schema_version: '1.0.0', failure_class: 'INPUT_OR_CONTRACT', code: 'NOT_FOUND', message: 'Not found', retryable: false, correlation_id: 'corr-eval',
    }));
    await act(() => result.current.loadRun('run-1'));
    await waitFor(() => expect(result.current.state.status).toBe('Run evidence loaded'));
    expect(result.current.state.evaluation).toBeNull();
  });

  it('returns the provider Run identifier after replay dispatch and refresh', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.replayRegistry).mockResolvedValue({
      project_id: 'project-a', build_id: 'build-replay', manifest_hash: 'sha256:manifest',
      seed: 42, run_id: 'run-replay-1', created: true,
    } as never);
    const item = {
      project_id: 'project-a', definition_version_id: 'dv-1', definition_id: 'definition-a', definition_version: 1,
      definition_hash: 'sha256:def', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
      build_id: 'build-replay', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
      fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-old', run_seed: 42, run_status: 'succeeded',
      runtime_versions: {}, definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
      artifact_ids: [], artifact_states: {}, evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: null, source_version: '1.0.0',
    };
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    let replayedRunId: string | null | undefined;
    await act(async () => { replayedRunId = await result.current.replay(item as never); });

    expect(replayedRunId).toBe('run-replay-1');
  });

  it('selects the Definition returned by a new scenario submission', async () => {
    const oldDefinition = definition('project-a', 'definition-old');
    const createdDefinition = definition('project-a', 'definition-created');
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [oldDefinition], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [oldDefinition, createdDefinition], next_cursor: null } as never);
    vi.mocked(apiClient.createProviderDefinition).mockResolvedValue({
      ...createdDefinition,
      created: true,
    } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.selectDefinition(''));

    await act(() => result.current.createDefinition('new scenario prompt'));

    expect(apiClient.createProviderDefinition).toHaveBeenCalledWith('new scenario prompt', expect.any(Object));
    expect(result.current.state.definitions.map((item) => item.definition.definition_id)).toEqual([
      'definition-old',
      'definition-created',
    ]);
    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('definition-created');
  });

  it('keeps a New scenario unselected across a project refresh', async () => {
    const existingDefinition = definition('project-a', 'definition-existing');
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({
      project_id: 'project-a', items: [existingDefinition], next_cursor: null,
    } as never);
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    await act(() => result.current.selectDefinition(''));

    await act(() => result.current.refresh());

    expect(result.current.state.selectedDefinition).toBeNull();
  });

  it('does not fall back to a project Definition while an active agent thread has no publication', async () => {
    const existingDefinition = definition('project-a', 'definition-existing');
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({
      project_id: 'project-a', items: [existingDefinition], next_cursor: null,
    } as never);
    const { result } = renderHook(() => useLiveWorkspace());

    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('definition-existing');

    act(() => result.current.beginAgentThread());
    await act(() => result.current.refresh());

    expect(result.current.state.selectedDefinition).toBeNull();
  });

  it('selects only the exact DefinitionVersion id published by the active agent thread', async () => {
    const oldDefinition = definition('project-a', 'definition-same', 1);
    const publishedDefinition = definition('project-a', 'definition-same', 2);
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({
      project_id: 'project-a', items: [oldDefinition, publishedDefinition], next_cursor: null,
    } as never);
    const { result } = renderHook(() => useLiveWorkspace());

    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));
    act(() => result.current.beginAgentThread());
    act(() => result.current.publishAgentDefinition({
      definitionId: 'definition-same', version: null, definitionVersionId: publishedDefinition.definition_version_id,
    }));
    await act(() => result.current.refresh());

    expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('definition-same');
    expect(result.current.state.selectedDefinition?.definition.version).toBe(2);
  });

  it('reloads project history after a duplicate Definition submission', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition('project-a', 'definition-a')], next_cursor: null } as never);
    vi.mocked(apiClient.createProviderDefinition).mockRejectedValueOnce(new ApiError(409, {
      schema_version: '1.0.0', failure_class: 'INPUT_OR_CONTRACT', code: 'DUPLICATE_CONTENT_HASH',
      message: 'This project already holds a definition with identical semantic content.', retryable: false, correlation_id: 'corr-duplicate',
    }));
    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: 'token-a' }));

    await act(() => result.current.createDefinition('duplicate scenario'));

    expect(result.current.state.definitions[0].definition.definition_id).toBe('definition-a');
    expect(result.current.state.stage).toBe('ready');
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.status).toBe('Project data loaded');
  });

});
