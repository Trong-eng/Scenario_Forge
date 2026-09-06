import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgeWorkspace } from '../../../src/components/forge/ForgeWorkspace';
import { useLiveWorkspace } from '../../../src/components/forge/useLiveWorkspace';
import { apiClient, createProjectSession } from '../../../src/shared/api/client';
import type { AgentThread } from '../../../src/shared/api/agentTypes';

vi.mock('../../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/api/client')>('../../../src/shared/api/client');
  return {
    ...actual,
    apiClient: Object.fromEntries(Object.keys(actual.apiClient).map((key) => [key, vi.fn()])),
    createProjectSession: vi.fn(),
  };
});

const PROJECT_TOKEN = 'super-secret-token';

const definition = {
  request_id: 'req-1', job_id: null, job_status: null, correlation_id: 'corr-1', definition_version_id: 'dv-1', supersedes: null,
  definition: { schema_version: '1.0.0', project_id: 'project-a', definition_id: 'def-1', version: 2, description: 'Motorcycle crossing in rain', content_hash: 'sha256:def' },
  claims: [{ field: 'speed', value: '30', unit: 'km/h', source: 'user', evidence: '30 km/h', schema_version: '1.0.0' }],
  logical_ir: { actors: ['ego', 'motorcycle'], maneuvers: [{ actor: 'motorcycle', action: 'crossing' }], environment: { weather: 'rain' }, constraints: [] },
  provenance: { interpreter_id: 'rule-based', interpreter_version: '1', source: 'user', correlation_id: 'corr-1', created_at: '2026-08-14T00:00:00Z' },
};

const lineage = {
  project_id: 'project-a', definition_version_id: 'dv-1', definition_id: 'def-1', definition_version: 2, definition_hash: 'sha256:def',
  variant_id: 'var-1', variant_version: 1, variant_hash: 'sha256:var', build_id: 'build-1', manifest_hash: 'sha256:manifest',
  requested_generation_mode: 'baseline' as const, effective_generation_mode: 'baseline' as const, fallback_used: false,
  retrieval_id: null, retrieval_hash: null, run_id: 'run-1', run_seed: 42, run_status: 'succeeded', runtime_versions: {},
  definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {}, artifact_ids: ['artifact-1'],
  artifact_states: { 'artifact-1': 'published' }, evaluation_id: 'evaluation-1', evaluation_outcome: 'pass', evaluation_details: {},
  failure_code: null, source_version: '1.0.0',
};

const build = {
  build_id: 'build-1', project_id: 'project-a', definition_version_id: 'dv-1', definition_id: 'def-1', definition_version: 2,
  variant_id: 'var-1', variant_version: 1, parent_definition_hash: 'sha256:def', variant_hash: 'sha256:var',
  catalog_version: '1.0.0', catalog_reference_id: 'Town05', requested_generation_mode: 'baseline' as const,
  generation_mode: 'baseline' as const, fallback_used: false, retrieval_id: null, retrieval_hash: null, artifact_references: [],
  generator_version: 'generator-1', model_version: 'model-1', prompt_version: 'prompt-1', component_versions: {},
  toolchain_versions: {}, scenic_source: 'param map = "Town05"', validation_report: {}, compile_report: {}, sampling_report: {},
  repair_history: [], manifest_hash: 'sha256:manifest',
};

const run = {
  run: { schema_version: '1.0.0', run_id: 'run-1', build_id: 'build-1', manifest_hash: 'sha256:manifest', seed: 42, mode: 'smoke' as const },
  job_id: 'job-1', approval_id: 'approval-1', attempt: 0, status: 'succeeded',
  progress: { phase: 'completed', completed_steps: 1, total_steps: 1 }, sampled_values: {}, versions: {}, failure: null,
  cleanup: { outcome: 'succeeded', detail: null }, artifact: null, replay_of: null,
};

const agentThread: AgentThread = {
  thread_id: 'thread-1', project_id: 'project-a', status: 'completed',
  title: 'Motorcycle crossing in rain', summary: 'A motorcycle crosses in front of ego.',
  turn_count: 2, created_at: '2026-08-21T10:40:00Z', updated_at: '2026-08-21T10:45:00Z',
  correlation_id: 'corr-agent-thread',
};

/* The workspace reads two independent media queries. Driving them explicitly is
   the only way a jsdom test can distinguish the docked desktop shell from the
   compact drawer, since jsdom never evaluates widths on its own. */
function stubViewport({ compact }: { compact: boolean }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 955px)' ? compact : compact,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function renderReadyWorkspace() {
  render(<ForgeWorkspace />);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Scenario Forge provider ready'));
}

describe('ForgeWorkspace live provider behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubViewport({ compact: false });
    vi.mocked(createProjectSession).mockResolvedValue({
      project_id: 'project-a', project_token: PROJECT_TOKEN, permissions: ['create_definition', 'read_definition', 'approve', 'run'],
    });
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [definition], next_cursor: null } as never);
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [agentThread], next_cursor: null, correlation_id: 'corr-agent-list',
    });
    vi.mocked(apiClient.getAgentThread).mockResolvedValue(agentThread);
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({ items: [], correlation_id: 'corr-agent-transcript' });
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockResolvedValue(undefined);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [lineage], next_cursor: null } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue(build as never);
    vi.mocked(apiClient.getBuildArtifacts).mockResolvedValue([] as never);
    vi.mocked(apiClient.getRunView).mockResolvedValue(run as never);
    vi.mocked(apiClient.getEvaluation).mockResolvedValue({
      schema_version: '1.0.0',
      evaluation: { schema_version: '1.0.0', evaluation_id: 'evaluation-1', run_id: 'run-1', definition_hash: 'sha256:def', outcome: 'pass' },
      report: { outcome: 'pass' },
    } as never);
    vi.mocked(apiClient.getRegistryArtifact).mockResolvedValue({
      project_id: 'project-a', artifact_id: 'artifact-1', status: 'published', manifest_hash: 'sha256:manifest',
      checksum: 'sha256:artifact', public_uri: null, tombstone_reason: null,
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads the workspace from real provider responses without rendering the project token', async () => {
    await renderReadyWorkspace();

    const navigation = screen.getByRole('complementary', { name: 'Điều hướng kịch bản' });
    expect(await within(navigation).findByRole('button', { name: /Motorcycle crossing in rain Hoàn tất/ })).toBeDefined();
    expect(await within(navigation).findByText('Hoàn tất')).toBeDefined();
    /* The project token authorises every provider call. It must reach the
       transport and nothing else -- never the DOM, never a screenshot. */
    expect(document.body.textContent).not.toContain(PROJECT_TOKEN);
    expect(document.body.textContent).not.toContain('Mock UI');
    expect(apiClient.listDefinitions).toHaveBeenCalledTimes(1);
    expect(apiClient.listAgentThreads).toHaveBeenCalledTimes(1);
    expect(apiClient.getRegistry).toHaveBeenCalledTimes(1);
  });

  it('defaults to the deployment-selected RAG + LLM mode and sends it with Definition retrieval provenance', async () => {
    vi.stubEnv('NEXT_PUBLIC_SCENIC_DEFAULT_GENERATION_MODE', 'rag');
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'var-rag', content_hash: 'sha256:var-rag' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-rag', status: 'succeeded', result: { build_id: 'build-rag' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ ...build, build_id: 'build-rag', manifest_hash: 'sha256:manifest-rag' } as never);

    await renderReadyWorkspace();
    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    fireEvent.click(within(canvas).getByRole('tab', { name: /^Cấu trúc/ }));

    expect(within(canvas).getByRole('combobox', { name: 'Chế độ sinh Bản dựng' })).toHaveValue('rag');
    fireEvent.click(within(canvas).getByRole('button', { name: 'Neo và dựng Scenic' }));
    await waitFor(() => expect(apiClient.createProviderBuild).toHaveBeenCalledWith(
      'sha256:var-rag', 'rag', expect.objectContaining({ projectId: 'project-a' }), definition.definition.description,
    ));
  });

  it('keeps baseline as the default and dispatches it without a retrieval query when no deployment override exists', async () => {
    vi.unstubAllEnvs();
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.groundVariant).mockResolvedValue({ variant_id: 'var-baseline', content_hash: 'sha256:var-baseline' } as never);
    vi.mocked(apiClient.createProviderBuild).mockResolvedValue({ job_id: 'job-baseline', status: 'succeeded', result: { build_id: 'build-baseline' } } as never);
    vi.mocked(apiClient.getProviderBuild).mockResolvedValue({ ...build, build_id: 'build-baseline', manifest_hash: 'sha256:manifest-baseline' } as never);

    await renderReadyWorkspace();
    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    fireEvent.click(within(canvas).getByRole('tab', { name: /^Cấu trúc/ }));

    const mode = within(canvas).getByRole('combobox', { name: 'Chế độ sinh Bản dựng' });
    expect(mode).toHaveValue('baseline');
    fireEvent.change(mode, { target: { value: 'rag' } });
    expect(mode).toHaveValue('rag');
    fireEvent.click(within(canvas).getByRole('button', { name: 'Neo và dựng Scenic' }));
    await waitFor(() => expect(apiClient.createProviderBuild).toHaveBeenCalledWith(
      'sha256:var-baseline', 'rag', expect.objectContaining({ projectId: 'project-a' }), definition.definition.description,
    ));
  });

  it('keeps durable draft agent threads reachable in Recent', async () => {
    const draftThread = {
      ...agentThread, thread_id: 'thread-draft', title: 'Something happens near the ego.',
      summary: 'Something happens near the ego.', status: 'draft',
    };
    const pendingThread = {
      ...agentThread, thread_id: 'thread-pending', title: 'Town05 crossing',
      summary: 'A pedestrian crosses.', status: 'active',
    };
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.listAgentThreads).mockResolvedValue({
      items: [draftThread, pendingThread], next_cursor: null, correlation_id: 'corr-agent-list',
    });
    vi.mocked(apiClient.getAgentThread).mockResolvedValue(pendingThread);
    vi.mocked(apiClient.getAgentTranscript).mockResolvedValue({
      items: [{
        message_id: 'message-1', role: 'user', safe_summary: 'A pedestrian crosses.',
        created_at: '2026-08-21T10:45:23Z',
      }],
      correlation_id: 'corr-agent-transcript',
    });

    await renderReadyWorkspace();
    const navigation = screen.getByRole('complementary', { name: 'Điều hướng kịch bản' });
    expect(await within(navigation).findByRole('button', { name: /Something happens near the ego\. Bản nháp/ })).toBeDefined();
    fireEvent.click(within(navigation).getByRole('button', { name: /Town05 crossing Đang xử lý/ }));

    await waitFor(() => expect(apiClient.getAgentTranscript).toHaveBeenCalledWith(
      'thread-pending', expect.objectContaining({ projectId: 'project-a' }),
    ));
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.getByLabelText('Agent message')).toBeDefined();
    expect(screen.queryByLabelText('Scenario request')).toBeNull();
    expect(screen.queryByText('Provide the remaining structured scenario details.')).toBeNull();
  });

  it('renames a Recent thread inline without patching its Definition', async () => {
    vi.mocked(apiClient.renameAgentThread).mockResolvedValue({
      ...agentThread, title: 'Rain crossing review',
    });
    await renderReadyWorkspace();
    const navigation = screen.getByRole('complementary', { name: 'Điều hướng kịch bản' });

    fireEvent.click(await within(navigation).findByRole('button', { name: 'Đổi tên Motorcycle crossing in rain' }));
    const input = within(navigation).getByRole('textbox', { name: 'Tên cuộc trò chuyện' });
    fireEvent.change(input, { target: { value: 'Rain crossing review' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(apiClient.renameAgentThread).toHaveBeenCalledWith(
      'thread-1', 'Rain crossing review', expect.objectContaining({ projectId: 'project-a' }),
    ));
    expect(apiClient.patchProviderDefinition).not.toHaveBeenCalled();
    expect(within(navigation).getByText('Rain crossing review')).toBeDefined();
  });

  it('opens the three-step Canvas when the selected provider Definition is durable', async () => {
    await renderReadyWorkspace();

    expect(screen.getByTestId('forge-background')).toBeDefined();
    expect(screen.getByTestId('workspace-shell')).toBeDefined();
    expect(screen.getByRole('complementary', { name: 'Điều hướng kịch bản' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Điều hướng Forge' })).toBeDefined();

    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    const steps = within(canvas).getByRole('tablist', { name: 'Workbench views' });
    expect(within(steps).getAllByRole('tab')).toHaveLength(3);
    /* Restored durable work opens at its most advanced step, while a freshly
       published Definition transitions to Structured (covered by the model). */
    expect(within(steps).getByRole('tab', { name: /^Lượt chạy/ }).getAttribute('aria-selected')).toBe('true');
    expect(within(steps).getByRole('tab', { name: /^Bản dựng/ })).toBeDefined();
    expect(within(steps).getByRole('tab', { name: /^Lượt chạy/ })).toBeDefined();
    fireEvent.click(within(steps).getByRole('tab', { name: /^Cấu trúc/ }));
    expect(screen.getByRole('region', { name: 'Định nghĩa kịch bản' })).toBeDefined();

    fireEvent.click(within(canvas).getByRole('button', { name: 'Đóng canvas' }));
    expect(screen.queryByRole('region', { name: 'Bảng dựng kịch bản' })).toBeNull();
    const artifactTrigger = screen.getByRole('button', { name: 'Mở canvas: Định nghĩa v2' });
    expect(within(artifactTrigger).getByText('Lượt chạy · Hoàn tất')).toBeDefined();
    artifactTrigger.focus();
    fireEvent.click(artifactTrigger);
    const reopenedCanvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    expect(within(reopenedCanvas).getByRole('tab', { name: /^Lượt chạy/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng canvas' }));
    await waitFor(() => expect(document.activeElement).toBe(artifactTrigger));
    expect(screen.queryByRole('banner')).toBeNull();
    expect(document.body.textContent).not.toContain(PROJECT_TOKEN);
  });

  it('renders saved-but-refresh-failed guidance instead of generic patch rejection', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition], next_cursor: null } as never)
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    vi.mocked(apiClient.patchProviderDefinition).mockResolvedValue({
      ...definition,
      definition_version_id: 'dv-2',
      definition: { ...definition.definition, version: 2 },
    } as never);

    await renderReadyWorkspace();
    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    fireEvent.click(within(canvas).getByRole('tab', { name: /^Cấu trúc/ }));
    fireEvent.change(within(canvas).getByLabelText('Tốc độ ban đầu'), { target: { value: '12' } });
    fireEvent.click(within(canvas).getByRole('button', { name: 'Gửi thay đổi' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Definition was saved');
    expect(alert.textContent).toContain('refresh');
    expect(alert.textContent).not.toContain('Provider từ chối bản vá Definition');
  });

  it('keeps the reloaded speed number editable while preserving its read-only unit', async () => {
    await renderReadyWorkspace();
    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    fireEvent.click(within(canvas).getByRole('tab', { name: /^Cấu trúc/ }));

    const speedInput = within(canvas).getByRole('spinbutton', { name: 'Tốc độ ban đầu' }) as HTMLInputElement;
    expect(speedInput.value).toBe('30');
    const speedUnit = within(canvas).getByRole('combobox', { name: 'Đơn vị của Tốc độ ban đầu' });
    expect(speedUnit.textContent).toContain('km/h');
    expect(speedUnit.getAttribute('aria-disabled')).toBe('true');
    expect(speedUnit.getAttribute('title')).toContain('backend');

    fireEvent.change(speedInput, { target: { value: '12' } });

    expect(speedInput.value).toBe('12');
    expect(speedUnit.textContent).toContain('km/h');
  });

  it('keeps a constraint-only speed unit read-only and sends no edit', async () => {
    const constraintOnlyDefinition = {
      ...definition,
      claims: [],
      logical_ir: {
        ...definition.logical_ir,
        constraints: [{ actor: 'ego', field: 'speed', value: '10 m/s' }],
      },
    };
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({
      project_id: 'project-a', items: [constraintOnlyDefinition], next_cursor: null,
    } as never);

    await renderReadyWorkspace();
    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    fireEvent.click(within(canvas).getByRole('tab', { name: /^Cấu trúc/ }));

    const staticSpeed = within(canvas).getByText('10 m/s');
    expect(staticSpeed.getAttribute('id')).toBe('field-speed');
    expect(staticSpeed.getAttribute('aria-labelledby')).toBe('field-label-speed');
    expect(within(canvas).queryByRole('spinbutton', { name: 'Tốc độ ban đầu' })).toBeNull();
    expect(within(canvas).getByText(/constraint-only speed is read-only/i)).toBeDefined();

    expect(apiClient.patchProviderDefinition).not.toHaveBeenCalled();
  });

  it('shows a range validation message and sends no PATCH for out-of-range speed drafts', async () => {
    await renderReadyWorkspace();
    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    fireEvent.click(within(canvas).getByRole('tab', { name: /^Cấu trúc/ }));
    const speedInput = within(canvas).getByRole('spinbutton', { name: 'Tốc độ ban đầu' }) as HTMLInputElement;
    const submit = within(canvas).getByRole('button', { name: 'Gửi thay đổi' });

    for (const invalid of ['-1', '301']) {
      fireEvent.change(speedInput, { target: { value: invalid } });
      expect(speedInput.value).toBe(invalid);
      expect(within(canvas).getByText('Speed must be between 0 and 300.')).toBeDefined();
      fireEvent.click(submit);
    }

    expect(apiClient.patchProviderDefinition).not.toHaveBeenCalled();
  });

  it('expands the mounted Canvas across the app and collapses without closing it', async () => {
    await renderReadyWorkspace();

    const navigation = screen.getByRole('complementary', { name: 'Điều hướng kịch bản' });
    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    fireEvent.click(within(canvas).getByRole('button', { name: 'Phóng to canvas' }));

    await waitFor(() => expect(screen.getByTestId('forge-background').getAttribute('data-canvas-presentation')).toBe('fullscreen'));
    expect(navigation.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('region', { name: 'Bảng dựng kịch bản' }).className).toContain('fixed');
    expect(document.getElementById('workspace-panel-agent')?.isConnected).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('forge-background').getAttribute('data-canvas-presentation')).toBe('split'));
    expect(screen.getByRole('complementary', { name: 'Điều hướng kịch bản' }).getAttribute('aria-hidden')).toBeNull();
    expect(screen.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeDefined();
  });

  it('uses provider lineage for Library and Runs navigation', async () => {
    await renderReadyWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Thư viện kịch bản' }));
    expect(await screen.findByRole('heading', { name: 'Thư viện kịch bản' })).toBeDefined();
    expect(screen.queryByTitle('Sửa mô tả — sẽ publish một DefinitionVersion mới')).toBeNull();
    expect(screen.queryByText(/Definition v2 · sha256:def/)).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Tìm kịch bản' })).toBeDefined();
    expect(screen.getByText('build-1')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Lượt chạy' }));
    expect(await screen.findByRole('heading', { name: 'Lượt chạy' })).toBeDefined();
    expect(screen.queryByTitle('Sửa mô tả — sẽ publish một DefinitionVersion mới')).toBeNull();
    expect(screen.queryByText(/Definition v2 · sha256:def/)).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Tìm lượt chạy' })).toBeDefined();
    expect(screen.getAllByText('run-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pass/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Mẫu' }));
    expect(await screen.findByRole('heading', { name: 'Mẫu' })).toBeDefined();
    expect(screen.queryByTitle('Sửa mô tả — sẽ publish một DefinitionVersion mới')).toBeNull();
    expect(screen.queryByText(/Definition v2 · sha256:def/)).toBeNull();
  });

  it('opens a Library Definition on the Structured Canvas after provider selection completes', async () => {
    await renderReadyWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Thư viện kịch bản' }));
    const inventory = await screen.findByRole('table', { name: 'Danh sách kịch bản' });
    fireEvent.click(within(inventory).getByRole('button', { name: /Motorcycle crossing in rain/ }));

    const canvas = await screen.findByRole('region', { name: 'Bảng dựng kịch bản' });
    expect(within(canvas).getByRole('tab', { name: /^Cấu trúc/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('starts a clean Workspace intake from the Library New scenario action', async () => {
    await renderReadyWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Thư viện kịch bản' }));
    const library = (await screen.findByRole('heading', { name: 'Thư viện kịch bản' })).closest('section');
    fireEvent.click(within(library as HTMLElement).getByRole('button', { name: 'Kịch bản mới' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Bảng dựng kịch bản' })).toBeNull());
    expect(screen.getByLabelText('Agent goal')).toBeDefined();
  });

  it('archives a Definition through the provider, clears the selection, and refreshes', async () => {
    vi.mocked(apiClient.listDefinitions)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [definition], next_cursor: null } as never)
      .mockResolvedValueOnce({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.archiveProviderDefinition).mockResolvedValue({ definition_id: 'def-1', archived: true } as never);

    const { result } = renderHook(() => useLiveWorkspace());
    await act(() => result.current.connect({ projectId: 'project-a', projectToken: PROJECT_TOKEN }));
    act(() => { result.current.selectDefinition('def-1'); });
    await waitFor(() => expect(result.current.state.selectedDefinition?.definition.definition_id).toBe('def-1'));

    await act(() => result.current.archiveDefinition('def-1'));

    expect(apiClient.archiveProviderDefinition).toHaveBeenCalledWith(
      'def-1', expect.objectContaining({ projectId: 'project-a' }),
    );
    await waitFor(() => expect(result.current.state.definitions).toHaveLength(0));
    expect(result.current.state.selectedDefinition).toBeNull();
  });

  it('provides an accessible responsive navigation drawer', async () => {
    /* A project with no Definitions yet, so the drawer is the only modal on
       screen and the assertions below describe it alone. */
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    stubViewport({ compact: true });
    await renderReadyWorkspace();

    expect(screen.getByRole('complementary', { name: 'Điều hướng kịch bản' }).getAttribute('data-open')).toBe('false');
    const trigger = screen.getByRole('button', { name: 'Mở điều hướng từ đầu trang' });

    fireEvent.click(trigger);

    const drawer = await screen.findByRole('dialog', { name: 'Điều hướng kịch bản' });
    expect(drawer.getAttribute('data-open')).toBe('true');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    /* While the drawer is modal the shell behind it must not be reachable, or
       focus and screen-reader order leak into content the user cannot see. */
    expect(screen.getByTestId('workspace-shell').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('navigation-backdrop')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));

    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Điều hướng kịch bản' }).getAttribute('data-open')).toBe('false'));
    expect(screen.queryByTestId('navigation-backdrop')).toBeNull();
  });

  it('uses the unified agent composer instead of any removed conversation form', async () => {
    vi.mocked(apiClient.listDefinitions).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.getRegistry).mockResolvedValue({ project_id: 'project-a', items: [], next_cursor: null } as never);
    vi.mocked(apiClient.createAgentThread).mockResolvedValue({
      thread_id: 'agent-thread-1', project_id: 'project-a', status: 'active',
      summary: 'Một xe cắt ngang trước ego.', turn_count: 1,
      created_at: '2026-08-21T00:00:00Z', updated_at: '2026-08-21T00:00:00Z', correlation_id: 'corr-agent-thread',
    } as never);
    vi.mocked(apiClient.getPendingAgentInterrupt).mockResolvedValue(null);
    vi.mocked(apiClient.streamAgentEvents).mockResolvedValue(undefined as never);
    await renderReadyWorkspace();

    fireEvent.change(screen.getByLabelText('Agent goal'), { target: { value: 'Một xe cắt ngang trước ego.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }));

    await waitFor(() => expect(apiClient.createAgentThread).toHaveBeenCalledWith(
      'Một xe cắt ngang trước ego.', expect.objectContaining({ projectId: 'project-a', projectToken: PROJECT_TOKEN }),
    ));
    expect((apiClient as unknown as Record<string, unknown>).createAuthoringSession).toBeUndefined();
    expect(screen.queryByLabelText('Scenario request')).toBeNull();
  });
});
