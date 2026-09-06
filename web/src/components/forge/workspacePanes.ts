import type { LiveWorkspaceState } from './liveTypes';

export const workspacePaneIds = ['agent', 'capabilities', 'definition', 'build', 'run'] as const;
export type WorkspacePaneId = (typeof workspacePaneIds)[number];
export type ArtifactPaneId = Exclude<WorkspacePaneId, 'agent' | 'capabilities'>;

export const workspacePaneLabels: Record<WorkspacePaneId, string> = {
  agent: 'Agent',
  capabilities: 'Capabilities',
  definition: 'Definition',
  build: 'Build',
  run: 'Run',
};

export type PanePreference = {
  active: WorkspacePaneId;
  open: boolean;
  discovered: ArtifactPaneId[];
};

/**
 * A Run may only consume the immutable Build manifest that was approved.
 * Rejected, invalidated, or older approvals are intentionally not reusable.
 */
export function hasExactApproval(
  build: LiveWorkspaceState['build'],
  approval: LiveWorkspaceState['approval'],
) {
  return Boolean(
    build
      && approval
      && approval.decision === 'approved'
      && approval.invalidated === false
      && approval.build_id === build.build_id
      && approval.manifest_hash === build.manifest_hash,
  );
}

function isPaneId(value: unknown): value is WorkspacePaneId {
  return typeof value === 'string' && workspacePaneIds.includes(value as WorkspacePaneId);
}

function isArtifactPaneId(value: unknown): value is ArtifactPaneId {
  return isPaneId(value) && value !== 'agent' && value !== 'capabilities';
}

export function deriveWorkspacePanes(state: LiveWorkspaceState): WorkspacePaneId[] {
  // The Capabilities seam pane is always available: it is a bounded, read-only
  // projection owned by AGENT-001 and carries no artifact side effects.
  const panes: WorkspacePaneId[] = ['agent', 'capabilities'];
  if (state.selectedDefinition) panes.push('definition');
  if (state.buildJob || state.build) panes.push('build');
  if (hasExactApproval(state.build, state.approval) || state.run) panes.push('run');
  return [...new Set(panes)];
}

export function panePreferenceKey(projectId: string, threadId: string) {
  return `scenario-forge:workspace-panes:${projectId}:${threadId}`;
}

export function serializePanePreference(preference: PanePreference) {
  return JSON.stringify(preference);
}

export function parsePanePreference(value: string | null): PanePreference | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const normalize = (pane: unknown) => pane === 'approval' ? 'build' : pane;
    const active = normalize(parsed.active);
    if (!isPaneId(active) || typeof parsed.open !== 'boolean' || !Array.isArray(parsed.discovered)) return null;
    const discovered = parsed.discovered.map(normalize);
    if (!discovered.every(isArtifactPaneId)) return null;
    return {
      active,
      open: parsed.open,
      discovered: [...new Set(discovered)],
    };
  } catch {
    return null;
  }
}
