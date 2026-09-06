import { describe, expect, it } from 'vitest';
import { deriveWorkspacePanes, parsePanePreference, serializePanePreference, workspacePaneIds, workspacePaneLabels } from '../../../src/components/forge/workspacePanes';
import type { LiveWorkspaceState } from '../../../src/components/forge/liveTypes';

const state = (overrides: Partial<LiveWorkspaceState> = {}): LiveWorkspaceState => ({
  session: null,
  stage: 'ready',
  runEvidencePending: false,
  status: 'ready',
  error: null,
  recovery: null,
  definitions: [],
  registry: [],
  selectedDefinition: null,
  variant: null,
  buildJob: null,
  build: null,
  approval: null,
  run: null,
  evaluation: null,
  artifacts: [],
  artifactOutcomes: [],
  ...overrides,
});

describe('deriveWorkspacePanes', () => {
  it('keeps intake conversation-only until durable artifacts exist', () => {
    expect(deriveWorkspacePanes(state())).toEqual(['agent', 'capabilities']);
  });

  it('reveals the four intent panes without a separate Approval destination', () => {
    const definition = { definition: { definition_id: 'definition-1' } } as never;
    const buildJob = { job_id: 'job-1' } as never;
    const build = { build_id: 'build-1', manifest_hash: 'sha256:manifest-1' } as never;
    const approval = {
      approval_id: 'approval-1', decision: 'approved', invalidated: false,
      build_id: 'build-1', manifest_hash: 'sha256:manifest-1',
    } as never;
    const run = { run_id: 'run-1' } as never;

    expect(deriveWorkspacePanes(state({ selectedDefinition: definition }))).toEqual(['agent', 'capabilities', 'definition']);
    expect(deriveWorkspacePanes(state({ selectedDefinition: definition, buildJob }))).toEqual(['agent', 'capabilities', 'definition', 'build']);
    expect(deriveWorkspacePanes(state({ selectedDefinition: definition, build }))).toEqual(['agent', 'capabilities', 'definition', 'build']);
    expect(deriveWorkspacePanes(state({ selectedDefinition: definition, build, approval }))).toEqual(['agent', 'capabilities', 'definition', 'build', 'run']);
    expect(deriveWorkspacePanes(state({ selectedDefinition: definition, build, approval, run }))).toEqual(['agent', 'capabilities', 'definition', 'build', 'run']);
  });

  it('does not reveal Run for rejected, invalidated, or stale approval records', () => {
    const definition = { definition: { definition_id: 'definition-1' } } as never;
    const build = { build_id: 'build-1', manifest_hash: 'sha256:manifest-1' } as never;
    const rejected = { approval_id: 'approval-1', decision: 'rejected', invalidated: false, build_id: 'build-1', manifest_hash: 'sha256:manifest-1' } as never;
    const invalidated = { approval_id: 'approval-2', decision: 'approved', invalidated: true, build_id: 'build-1', manifest_hash: 'sha256:manifest-1' } as never;
    const stale = { approval_id: 'approval-3', decision: 'approved', invalidated: false, build_id: 'build-old', manifest_hash: 'sha256:manifest-old' } as never;

    for (const approval of [rejected, invalidated, stale]) {
      expect(deriveWorkspacePanes(state({ selectedDefinition: definition, build, approval }))).toEqual(['agent', 'capabilities', 'definition', 'build']);
    }
  });
});

describe('pane preference persistence', () => {
  it('round-trips a thread-scoped collapsed preference and discovered panes', () => {
    const encoded = serializePanePreference({
      active: 'build',
      open: false,
      discovered: ['definition', 'build'],
    });

    expect(parsePanePreference(encoded)).toEqual({
      active: 'build',
      open: false,
      discovered: ['definition', 'build'],
    });
  });

  it('fails closed on stale or malformed browser state', () => {
    expect(parsePanePreference('{not-json')).toBeNull();
    expect(parsePanePreference(JSON.stringify({ active: 'private-pane', open: true }))).toBeNull();
  });

  it('migrates a previously stored Approval pane into Build', () => {
    expect(parsePanePreference(JSON.stringify({ active: 'approval', open: true, discovered: ['definition', 'approval'] }))).toEqual({
      active: 'build',
      open: true,
      discovered: ['definition', 'build'],
    });
  });
});

describe('Capabilities pane seam (TIP-AGENT-004)', () => {
  it('registers capabilities as a first-class workspace pane', () => {
    expect(workspacePaneIds).toContain('capabilities');
    expect(workspacePaneLabels.capabilities).toBe('Capabilities');
  });

  it('derives the Capabilities pane beside Agent without any artifact state', () => {
    const panes = deriveWorkspacePanes(state());
    expect(panes[0]).toBe('agent');
    expect(panes).toContain('capabilities');
    // The seam pane never implies Definition/Build/Run side effects.
    expect(panes.filter((pane) => pane === 'definition' || pane === 'build' || pane === 'run')).toEqual([]);
  });

  it('keeps persisted preferences valid when the active pane is capabilities', () => {
    const encoded = serializePanePreference({ active: 'capabilities', open: true, discovered: [] });
    expect(parsePanePreference(encoded)?.active).toBe('capabilities');
  });
});
