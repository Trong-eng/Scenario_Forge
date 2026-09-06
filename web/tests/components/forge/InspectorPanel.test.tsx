import { createRef, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InspectorPanel, type InspectorLive } from '../../../src/components/forge/InspectorPanel';
import type { ProviderEvaluation, ProviderRunView, RegistryArtifactOutcome } from '../../../src/shared/api/schemas';

const live = (overrides: Partial<InspectorLive> = {}): InspectorLive => ({
  seed: '42',
  buildLabel: 'build-1',
  readiness: 'Approval required',
  preflight: [],
  ...overrides,
});

const run: ProviderRunView = {
  run: {
    schema_version: '1.0.0',
    run_id: 'run-1',
    build_id: 'build-1',
    manifest_hash: 'sha256:manifest',
    seed: 42,
    status: 'succeeded',
    mode: 'smoke',
  },
  job_id: 'job-1',
  approval_id: 'approval-1',
  attempt: 0,
  status: 'succeeded',
  progress: { phase: 'completed', completed_steps: 6, total_steps: 6 },
  sampled_values: { pedestrian_speed: 1.4 },
  versions: { carla: '0.9.15' },
  failure: null,
  cleanup: { outcome: 'succeeded', detail: null },
  artifact: null,
  replay_of: null,
};

const evaluation: ProviderEvaluation = {
  schema_version: '1.0.0',
  evaluation: {
    schema_version: '1.0.0',
    evaluation_id: 'evaluation-1',
    run_id: 'run-1',
    definition_hash: 'sha256:def',
    outcome: 'pass',
  },
  report: { minimum_distance: 4.2 },
};

const artifacts: RegistryArtifactOutcome[] = [{
  project_id: 'project-a',
  artifact_id: 'run_video-1',
  status: 'published',
  manifest_hash: 'sha256:manifest',
  checksum: 'sha256:video',
  public_uri: '/artifacts/run-1.mp4',
  tombstone_reason: null,
}];

function renderInspector(overrides: Partial<ComponentProps<typeof InspectorPanel>> = {}) {
  const onTabChange = vi.fn();
  render(<InspectorPanel
    mode="build"
    live={live()}
    approved={false}
    seed="42"
    onClose={vi.fn()}
    onApprove={vi.fn()}
    onCopyManifest={vi.fn()}
    onSeedChange={vi.fn()}
    onRun={vi.fn()}
    overlay={false}
    panelRef={createRef<HTMLElement>()}
    onPanelKeyDown={vi.fn()}
    {...overrides}
  />);
  return { onTabChange };
}

describe('InspectorPanel intent panes', () => {
  it('renders Build approval in context without nested Scene/Lượt chạy/Video tabs', () => {
    renderInspector();

    expect(screen.getByRole('heading', { name: 'Build' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Approve build' })).toBeDefined();
    expect(screen.queryByRole('tablist', { name: 'Inspector views' })).toBeNull();
    expect(screen.queryByText('Scene')).toBeNull();
  });

  it('renders Run controls, and no player at all until a Run exists', () => {
    renderInspector({
      mode: 'run',
      live: live({ readiness: 'Ready to run' }),
      approved: true,
    });

    expect(screen.getByRole('heading', { name: 'Run' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Chạy nhanh/i })).toBeDefined();
    expect(screen.queryByRole('tablist', { name: 'Inspector views' })).toBeNull();
    // Before a Run there is no evidence and no video: an empty player frame
    // beneath an empty evidence frame only made the tab look broken.
    expect(screen.queryByRole('heading', { name: 'Video' })).toBeNull();
    expect(screen.getByText(/Chưa có Run nào/)).toBeDefined();
  });

  it('shows exactly one Video section once a Run exists', () => {
    renderInspector({
      mode: 'run',
      live: live({ readiness: 'Ready to run' }),
      approved: true,
      run,
      evaluation,
    });

    expect(screen.getAllByRole('heading', { name: 'Video' })).toHaveLength(1);
    expect(screen.queryByText(/Chưa có Run nào/)).toBeNull();
  });

  it('locks Smoke and Full run until the exact Build approval is present', () => {
    renderInspector({ mode: 'run', live: live({ readiness: 'Approval required' }), approved: false });

    expect((screen.getByRole('button', { name: /Chạy nhanh/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Chạy đầy đủ/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Scenic source collapsed inside Build and copies it on demand', () => {
    const onCopyScenic = vi.fn();
    renderInspector({
      scenicSource: 'param map = "Town05"',
      onCopyScenic,
    });

    const scenicDisclosure = screen.getByText('Xem Scenic code').closest('details');
    expect(scenicDisclosure?.open).toBe(false);

    fireEvent.click(screen.getByText('Xem Scenic code'));
    expect(scenicDisclosure?.open).toBe(true);
    expect(screen.getByText('param map = "Town05"')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã Scenic' }));
    expect(onCopyScenic).toHaveBeenCalledTimes(1);
  });

  it('keeps Run outcome and video visible while technical evidence starts collapsed', () => {
    renderInspector({
      mode: 'run',
      live: live({ readiness: 'Ready to run', run, evaluation, artifacts }),
      approved: true,
      run,
      evaluation,
      artifacts,
    });

    expect(screen.getByText('run-1')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Video' })).toBeDefined();
    const technicalDisclosure = screen.getByText('Chi tiết kỹ thuật').closest('details');
    expect(technicalDisclosure?.open).toBe(false);

    fireEvent.click(screen.getByText('Chi tiết kỹ thuật'));
    expect(technicalDisclosure?.open).toBe(true);
    expect(screen.getByRole('heading', { name: 'Bằng chứng lúc chạy' })).toBeDefined();
    expect(screen.getByText(/Pedestrian Speed/)).toBeDefined();
    expect(screen.getByText('run_video-1')).toBeDefined();
  });
});
