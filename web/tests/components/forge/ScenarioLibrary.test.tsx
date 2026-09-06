import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ScenarioLibrary } from '../../../src/components/forge/ScenarioLibrary';

const definition = {
  request_id: 'req-1', job_id: null, job_status: null, correlation_id: 'corr-1', definition_version_id: 'dv-2', supersedes: 'dv-1',
  definition: { schema_version: '1.0.0', project_id: 'project-a', definition_id: 'definition-a', version: 2, description: 'Crossing', content_hash: 'sha256:def-2' },
  claims: [], logical_ir: {}, provenance: {},
};

const lineage = (version: number, buildId: string) => ({
  project_id: 'project-a', definition_version_id: `dv-${version}`, definition_id: 'definition-a', definition_version: version,
  definition_hash: `sha256:def-${version}`, variant_id: `variant-${version}`, variant_version: version, variant_hash: `sha256:variant-${version}`,
  build_id: buildId, manifest_hash: `sha256:${buildId}`, requested_generation_mode: 'baseline' as const, effective_generation_mode: 'baseline' as const,
  fallback_used: false, retrieval_id: null, retrieval_hash: null, run_id: null, run_seed: null, run_status: null, runtime_versions: {},
  definition_semantic: {}, variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {}, artifact_ids: [], artifact_states: {},
  evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: null, source_version: '1.0.0',
});

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it('labels and selects the highest semantic lineage version without claiming identifier order is latest', () => {
  render(<ScenarioLibrary
    definitions={[definition] as never}
    registry={[lineage(1, 'zzz-older'), lineage(2, 'aaa-newer')] as never}
    onSelect={vi.fn()}
    onReplay={async () => null}
    onCompare={async () => null}
  />);

  expect(screen.getByText('Bản dựng gần nhất')).toBeDefined();
  expect(screen.getByText('aaa-newer')).toBeDefined();
  expect(screen.queryByText('Latest build')).toBeNull();
});

it('shows visible pending and recoverable error feedback for Replay', async () => {
  const replay = deferred<string | null>();
  const replayable = { ...lineage(2, 'build-replay'), run_id: 'run-old', run_seed: 42, run_status: 'succeeded' };
  render(<ScenarioLibrary
    definitions={[definition] as never}
    registry={[replayable] as never}
    onSelect={vi.fn()}
    onReplay={() => replay.promise}
    onCompare={vi.fn()}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Replay build-replay' }));
  expect(screen.getByRole('button', { name: 'Replay build-replay' }).textContent).toBe('Replaying…');
  expect(screen.getByRole('button', { name: 'Replay build-replay' }).hasAttribute('disabled')).toBe(true);

  await act(async () => replay.reject(new Error('Replay was refused by the provider')));
  expect((await screen.findByRole('alert')).textContent).toContain('Replay was refused by the provider');
});

it('renders the exact provider comparison result after Compare completes', async () => {
  const compare = deferred<{
    project_id: string;
    left_build_id: string;
    right_build_id: string;
    definition_changes: string[];
    variant_changes: string[];
    build_changes: string[];
    run_changes: string[];
    evaluation_changes: string[];
    scenic_claims: string[];
  } | null>();
  render(<ScenarioLibrary
    definitions={[definition] as never}
    registry={[lineage(1, 'build-1'), lineage(2, 'build-2')] as never}
    onSelect={vi.fn()}
    onReplay={async () => null}
    onCompare={() => compare.promise}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Compare builds for definition-a' }));
  expect(screen.getByRole('button', { name: 'Compare builds for definition-a' }).textContent).toBe('Comparing…');

  await act(async () => compare.resolve({
    project_id: 'project-a', left_build_id: 'build-1', right_build_id: 'build-2',
    definition_changes: [], variant_changes: [], build_changes: ['manifest_hash'],
    run_changes: [], evaluation_changes: [], scenic_claims: [],
  }));
  await waitFor(() => expect(screen.getByText('manifest_hash')).toBeDefined());
});
