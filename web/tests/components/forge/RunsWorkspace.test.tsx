import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RunEvidence } from '../../../src/components/forge/LiveDataViews';
import { RunsWorkspace } from '../../../src/components/forge/RunsWorkspace';

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

it('reports artifact states instead of fabricating publication from identifier count', () => {
  const row = {
    project_id: 'project-a', definition_version_id: 'dv-1', definition_id: 'definition-a', definition_version: 1,
    definition_hash: 'sha256:def', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
    build_id: 'build-1', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
    fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-1', run_seed: 42, run_status: 'failed', runtime_versions: {},
    definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
    artifact_ids: ['artifact-1', 'artifact-2'], artifact_states: { 'artifact-1': 'missing', 'artifact-2': 'corrupt' },
    evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: 'RUNTIME_FAILED', source_version: '1.0.0',
  };
  render(<RunsWorkspace
    registry={[row] as never}
    run={null}
    evaluation={null}
    artifactOutcomes={[]}
    onSelect={vi.fn()}
    onCancel={vi.fn()}
    onCompare={vi.fn()}
  />);

  expect(screen.getByText('0 published · 2 unavailable')).toBeDefined();
  expect(screen.queryByText('2 published')).toBeNull();
});

it('opens the selected Run from an explicit action', async () => {
  const onSelect = vi.fn(async () => true);
  const row = {
    project_id: 'project-a', definition_version_id: 'dv-1', definition_id: 'definition-a', definition_version: 1,
    definition_hash: 'sha256:def', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
    build_id: 'build-1', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
    fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-new', run_seed: 42, run_status: 'running', runtime_versions: {},
    definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
    artifact_ids: [], artifact_states: {}, evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: null, source_version: '1.0.0',
  };
  render(<RunsWorkspace registry={[row] as never} run={null} evaluation={null} artifactOutcomes={[]} onSelect={onSelect} onCancel={vi.fn()} onCompare={vi.fn()} />);

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open run run-new' })));

  expect(onSelect).toHaveBeenCalledWith('run-new');
});

it('labels Run progress as pipeline phases instead of simulation steps', () => {
  render(<RunEvidence
    run={{
      run: { schema_version: '1.0.0', run_id: 'run-1', build_id: 'build-1', manifest_hash: 'sha256:manifest', seed: 42, mode: 'full' },
      job_id: 'job-1', approval_id: 'approval-1', attempt: 0, status: 'succeeded',
      progress: { phase: 'completed', completed_steps: 6, total_steps: 6 }, sampled_values: {}, versions: {}, failure: null,
      cleanup: { outcome: 'succeeded', detail: null }, artifact: null, replay_of: null,
    } as never}
    evaluation={null}
    artifacts={[]}
  />);

  expect(screen.getByText('Completed Pipeline Phases')).toBeDefined();
  expect(screen.getByText('Total Pipeline Phases')).toBeDefined();
  expect(screen.queryByText('Completed Steps')).toBeNull();
});

it('renders a published run_video outcome in the Run Video section', () => {
  render(<RunEvidence
    run={{
      run: { schema_version: '1.0.0', run_id: 'run-video', build_id: 'build-1', manifest_hash: 'sha256:manifest', seed: 42, mode: 'full' },
      job_id: 'job-1', approval_id: 'approval-1', attempt: 0, status: 'succeeded',
      progress: { phase: 'completed', completed_steps: 6, total_steps: 6 }, sampled_values: {}, versions: {}, failure: null,
      cleanup: { outcome: 'succeeded', detail: null }, artifact: null, replay_of: null,
    } as never}
    evaluation={null}
    artifacts={[{ artifact_id: 'run-video-1', status: 'published', public_uri: '/api/v1/projects/project-a/registry/media/run-video-1?signature=signed' } as never]}
  />);

  expect(screen.getByRole('heading', { name: 'Video' })).toBeDefined();
  expect(screen.getByLabelText('Video bằng chứng của lượt chạy').getAttribute('src')).toBe('/api/v1/projects/project-a/registry/media/run-video-1?signature=signed');
});

it('does not render playable media for an unavailable artifact', () => {
  render(<RunEvidence
    run={{
      run: { schema_version: '1.0.0', run_id: 'run-no-video', build_id: 'build-1', manifest_hash: 'sha256:manifest', seed: 42, mode: 'full' },
      job_id: 'job-1', approval_id: 'approval-1', attempt: 0, status: 'succeeded',
      progress: { phase: 'completed', completed_steps: 6, total_steps: 6 }, sampled_values: {}, versions: {}, failure: null,
      cleanup: { outcome: 'succeeded', detail: null }, artifact: null, replay_of: null,
    } as never}
    evaluation={null}
    artifacts={[{ artifact_id: 'run-video-1', status: 'missing', public_uri: '/not-authorized.mp4' } as never]}
  />);

  expect(screen.getByRole('heading', { name: 'Video' })).toBeDefined();
  expect(screen.queryByLabelText('Video bằng chứng của lượt chạy')).toBeNull();
});

it('keeps an Open action visibly pending and exposes a retryable error when evidence cannot load', async () => {
  const open = deferred<boolean>();
  const row = {
    project_id: 'project-a', definition_version_id: 'dv-1', definition_id: 'definition-a', definition_version: 1,
    definition_hash: 'sha256:def', variant_id: 'variant-1', variant_version: 1, variant_hash: 'sha256:variant',
    build_id: 'build-1', manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline', effective_generation_mode: 'baseline',
    fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: 'run-pending', run_seed: 42, run_status: 'running', runtime_versions: {},
    definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
    artifact_ids: [], artifact_states: {}, evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: null, source_version: '1.0.0',
  };
  render(<RunsWorkspace
    registry={[row] as never}
    run={null}
    evaluation={null}
    artifactOutcomes={[]}
    onSelect={() => open.promise}
    onCancel={vi.fn()}
    onCompare={async () => null}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Open run run-pending' }));
  expect(screen.getByRole('button', { name: 'Open run run-pending' }).textContent).toBe('Opening…');
  expect(screen.getByRole('button', { name: 'Open run run-pending' }).hasAttribute('disabled')).toBe(true);

  await act(async () => open.resolve(false));
  expect((await screen.findByRole('alert')).textContent).toContain('Không tải được bằng chứng lượt chạy');
});

it('hides the redundant evidence panel when the Run inventory is empty', () => {
  render(<RunsWorkspace
    registry={[]}
    run={null}
    evaluation={null}
    artifactOutcomes={[]}
    onSelect={async () => true}
    onCancel={vi.fn()}
    onCompare={async () => null}
  />);

  expect(screen.getByText('Không có Lượt chạy thật nào khớp bộ lọc này.')).toBeDefined();
  expect(screen.queryByRole('article', { name: 'Selected run evidence' })).toBeNull();
});

it('renders comparison output after choosing two Runs', async () => {
  const rows = ['build-1', 'build-2'].map((buildId, index) => ({
    project_id: 'project-a', definition_version_id: `dv-${index}`, definition_id: 'definition-a', definition_version: index + 1,
    definition_hash: `sha256:def-${index}`, variant_id: `variant-${index}`, variant_version: 1, variant_hash: `sha256:variant-${index}`,
    build_id: buildId, manifest_hash: `sha256:${buildId}`, requested_generation_mode: 'baseline' as const, effective_generation_mode: 'baseline' as const,
    fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: `run-${index + 1}`, run_seed: 42, run_status: 'succeeded', runtime_versions: {},
    definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {},
    artifact_ids: [], artifact_states: {}, evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: null, source_version: '1.0.0',
  }));
  render(<RunsWorkspace
    registry={rows as never}
    run={null}
    evaluation={null}
    artifactOutcomes={[]}
    onSelect={async () => true}
    onCancel={vi.fn()}
    onCompare={async () => ({
      project_id: 'project-a', left_build_id: 'build-1', right_build_id: 'build-2',
      definition_changes: [], variant_changes: [], build_changes: ['manifest_hash'], run_changes: [], evaluation_changes: [], scenic_claims: [],
    })}
  />);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select run run-1' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select run run-2' }));
  fireEvent.click(screen.getByRole('button', { name: 'So sánh mục đã chọn' }));
  await waitFor(() => expect(screen.getByText('manifest_hash')).toBeDefined());
});
