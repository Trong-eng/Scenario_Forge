'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiClient, type ProviderRequestContext } from '@/shared/api/client';
import type { ProviderJob, ProviderRegistryItem, RecoveryLockRecord, RecoveryRequiredError, RecoveryRequiredResult } from '@/shared/api/schemas';
import type { LiveSession, LiveWorkspaceState } from './liveTypes';
import { preferredLineage } from './lineage';
import { hasExactApproval } from './workspacePanes';

export type RegistryComparisonResult = Awaited<ReturnType<typeof apiClient.compareRegistry>>;

const initialState: LiveWorkspaceState = {
  session: null, stage: 'idle', status: 'Connect a project session', error: null, recovery: null,
  definitionRefreshRequired: false,
  definitions: [], registry: [], selectedDefinition: null, variant: null, buildJob: null, runEvidencePending: false,
  build: null, approval: null, run: null, evaluation: null, artifacts: [], artifactOutcomes: [],
};

type ContextFactory = (operation: string, identity?: string) => ProviderRequestContext;
type IsCurrent = () => boolean;
type SavedWorkspaceSelection = { definitionId: string | null; runId: string | null };

/** The only Definition identity an active agent thread may hand to Canvas. */
export type ActiveThreadDefinitionReference = {
  definitionId: string;
  /** Null is allowed for older event payloads when the version id is present. */
  version: number | null;
  definitionVersionId?: string;
};

export const BUILD_POLL_ATTEMPTS = 180;
const BUILD_POLL_INTERVAL_MS = 1000;
// The worker's default RUN_TIMEOUT_SECONDS is 600. A ten-minute bounded
// browser window covers that run lifecycle without leaving an unbounded poll.
export const RUN_POLL_ATTEMPTS = 300;
const RUN_POLL_INTERVAL_MS = 2000;

const wait = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

function selectionStorageKey(projectId: string) {
  return `scenario-forge:selection:${projectId}`;
}

function recoveryStorageKey(projectId: string) {
  return `scenario-forge:recovery:${projectId}`;
}

function readSavedRecovery(projectId: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(recoveryStorageKey(projectId));
  } catch {
    return null;
  }
}

function saveRecovery(projectId: string, recoveryId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (recoveryId) window.localStorage.setItem(recoveryStorageKey(projectId), recoveryId);
    else window.localStorage.removeItem(recoveryStorageKey(projectId));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function recoveryProjection(lock: RecoveryLockRecord): RecoveryRequiredResult {
  return {
    recovery_required: true,
    reason_code: lock.reason_code,
    source: {
      project_id: lock.project_id,
      definition_id: lock.source_definition_id,
      definition_version: lock.source_version,
      definition_version_id: lock.source_definition_version_id,
      content_hash: lock.source_content_hash,
    },
    recovery: lock,
    allowed_actions: ['approve', 'cancel', 'refresh'],
  };
}

function isRecoveryRequired(error: unknown): error is ApiError & { envelope: RecoveryRequiredError } {
  return error instanceof ApiError
    && 'recovery_required' in error.envelope
    && error.envelope.recovery_required === true;
}

function recoveryResultFromError(error: RecoveryRequiredError): RecoveryRequiredResult {
  return {
    recovery_required: true,
    reason_code: error.reason_code,
    source: error.source,
    recovery: error.recovery,
    allowed_actions: error.allowed_actions,
  };
}

function readSavedSelection(projectId: string): SavedWorkspaceSelection {
  if (typeof window === 'undefined') return { definitionId: null, runId: null };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(selectionStorageKey(projectId)) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return { definitionId: null, runId: null };
    const selection = parsed as Record<string, unknown>;
    return {
      definitionId: typeof selection.definitionId === 'string' ? selection.definitionId : null,
      runId: typeof selection.runId === 'string' ? selection.runId : null,
    };
  } catch {
    return { definitionId: null, runId: null };
  }
}

function saveSelection(projectId: string, selection: SavedWorkspaceSelection) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(selectionStorageKey(projectId), JSON.stringify(selection));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function buildCorrelationId(operation: string) {
  const compactOperation = operation.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 24);
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  return `web-${compactOperation}-${suffix}`;
}

export async function pollBuildJob(
  initialJob: ProviderJob,
  readJob: (jobId: string) => Promise<ProviderJob>,
  isCurrent: IsCurrent,
  sleep: (delayMs: number) => Promise<void> = wait,
): Promise<ProviderJob> {
  let job = initialJob;
  for (
    let attempt = 0;
    attempt < BUILD_POLL_ATTEMPTS
      && !job.result
      && !['failed', 'cancelled'].includes(job.status.toLowerCase());
    attempt += 1
  ) {
    await sleep(BUILD_POLL_INTERVAL_MS);
    if (!isCurrent()) return job;
    job = await readJob(job.job_id);
  }
  return job;
}

/** Poll a dispatched Run without allowing a stale workspace response to win. */
export async function pollRunEvidence<T>(
  initialSnapshot: T,
  readSnapshot: () => Promise<T>,
  isReady: (snapshot: T) => boolean,
  isCurrent: IsCurrent,
  sleep: (delayMs: number) => Promise<void> = wait,
  maxAttempts = RUN_POLL_ATTEMPTS,
  onSnapshot?: (snapshot: T) => void,
): Promise<T> {
  let snapshot = initialSnapshot;
  for (let attempt = 0; attempt < maxAttempts && !isReady(snapshot); attempt += 1) {
    await sleep(RUN_POLL_INTERVAL_MS);
    if (!isCurrent()) return snapshot;
    snapshot = await readSnapshot();
    onSnapshot?.(snapshot);
  }
  return snapshot;
}

type RunEvidenceSnapshot = {
  run: NonNullable<LiveWorkspaceState['run']>;
  evaluation: LiveWorkspaceState['evaluation'];
  artifactOutcomes: LiveWorkspaceState['artifactOutcomes'];
  registry: LiveWorkspaceState['registry'];
};

function terminalRunStatus(status: string) {
  return ['succeeded', 'failed', 'scenario failure', 'cancelled'].includes(status.toLowerCase());
}

function runEvidenceReady(snapshot: RunEvidenceSnapshot) {
  const status = snapshot.run.status.toLowerCase();
  if (!terminalRunStatus(status)) return false;
  if (status !== 'succeeded') return true;
  // A successful Run may publish its signed media URL shortly after the Run
  // itself reaches a terminal state. Keep polling while the registry has not
  // exposed any artifact outcome yet; the bounded limit prevents a stuck
  // provider from keeping the workspace request alive forever.
  const lineage = snapshot.registry.find((item) => item.run_id === snapshot.run.run.run_id);
  if (!lineage || snapshot.artifactOutcomes.length < lineage.artifact_ids.length) return false;
  const videoHint = /run[_-]?video|video\/|\.(?:mp4|webm)(?:$|[?#])/i;
  if (!snapshot.evaluation) return false;
  return snapshot.artifactOutcomes.some((artifact) => artifact.status === 'published'
    && Boolean(artifact.public_uri)
    && videoHint.test(`${artifact.artifact_id} ${artifact.public_uri}`));
}

async function loadLineage(
  lineage: LiveWorkspaceState['registry'][number],
  context: ContextFactory,
  isCurrent: IsCurrent,
) {
  if (!isCurrent()) return null;
  const [build, artifacts] = await Promise.all([
    apiClient.getProviderBuild(lineage.build_id, context('build-read', lineage.build_id)),
    apiClient.getBuildArtifacts(lineage.build_id, context('build-artifacts', lineage.build_id)),
  ]);
  if (!isCurrent()) return null;
  let run = null;
  let evaluation = null;
  let artifactOutcomes: LiveWorkspaceState['artifactOutcomes'] = [];
  if (lineage.run_id) {
    run = await apiClient.getRunView(lineage.run_id, context('run-read', lineage.run_id));
    if (!isCurrent()) return null;
    if (['succeeded', 'failed', 'scenario failure'].includes(run.status.toLowerCase())) {
      try { evaluation = await apiClient.getEvaluation(lineage.run_id, context('evaluation', lineage.run_id)); }
      catch (error) {
        if (!(error instanceof ApiError) || ![404, 501].includes(error.status)) throw error;
      }
      if (!isCurrent()) return null;
    }
    artifactOutcomes = await Promise.all(lineage.artifact_ids.map(
      (id) => apiClient.getRegistryArtifact(id, context('artifact', id)),
    ));
    if (!isCurrent()) return null;
  }
  return { build, artifacts, run, evaluation, artifactOutcomes };
}

async function loadRegistry(context: ContextFactory, isCurrent: IsCurrent) {
  const items: LiveWorkspaceState['registry'] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    if (!isCurrent()) return null;
    const page = await apiClient.getRegistry(undefined, context('registry', cursor), cursor);
    if (!isCurrent()) return null;
    items.push(...page.items);
    if (page.next_cursor && seen.has(page.next_cursor)) throw new Error('Registry returned a repeated cursor');
    if (page.next_cursor) seen.add(page.next_cursor);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return items;
}

async function readRunEvidence(
  runId: string,
  previous: RunEvidenceSnapshot,
  context: ContextFactory,
  isCurrent: IsCurrent,
): Promise<RunEvidenceSnapshot> {
  const run = await apiClient.getRunView(runId, context('run-read', runId));
  if (!isCurrent()) return previous;

  let evaluation: LiveWorkspaceState['evaluation'] = null;
  if (terminalRunStatus(run.status)) {
    try {
      evaluation = await apiClient.getEvaluation(runId, context('evaluation', runId));
    } catch (error) {
      if (!(error instanceof ApiError) || ![404, 501].includes(error.status)) throw error;
    }
    if (!isCurrent()) return previous;
  }

  const registry = (await loadRegistry(context, isCurrent)) ?? previous.registry;
  if (!isCurrent()) return previous;
  const lineage = registry.find((item) => item.run_id === runId);
  const artifactOutcomes = lineage
    ? (await Promise.all(lineage.artifact_ids.map(async (artifactId) => {
      try {
        return await apiClient.getRegistryArtifact(artifactId, context('artifact', artifactId));
      } catch (error) {
        // Registry publication is eventually consistent. A missing outcome is
        // a reason to poll again, not a reason to discard the Run snapshot.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    }))).filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  return { run, evaluation, artifactOutcomes, registry };
}

function message(error: unknown) {
  if (error instanceof ApiError) return `${error.envelope.message} · ${error.envelope.correlation_id}`;
  return error instanceof Error ? error.message : 'The provider request failed.';
}

function workspaceRunPriority(item: ProviderRegistryItem) {
  switch (item.run_status?.toLowerCase()) {
    case 'queued':
    case 'running':
      return 0;
    case 'succeeded':
      return 1;
    case undefined:
      return 2;
    case 'failed':
    case 'scenario failure':
      return 3;
    default:
      return 2;
  }
}

function defaultWorkspaceLineage(rows: ProviderRegistryItem[]): ProviderRegistryItem | undefined {
  const preferred = preferredLineage(rows);
  if (!preferred) return undefined;
  return rows.reduce((best, item) => (
    item.definition_version === preferred.definition_version
      && item.variant_version === preferred.variant_version
      && item.build_id === preferred.build_id
      && workspaceRunPriority(item) < workspaceRunPriority(best)
      ? item
      : best
  ), preferred);
}

export function useLiveWorkspace() {
  const [state, setState] = useState(initialState);
  const sessionRef = useRef<LiveSession | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const newScenarioRef = useRef(false);
  const selectedRunIdRef = useRef<string | null>(null);
  const activeAgentThreadRef = useRef(false);
  const activeThreadDefinitionRef = useRef<ActiveThreadDefinitionReference | null>(null);
  const keys = useRef(new Map<string, string>());
  const generation = useRef(0);
  const operationGeneration = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const contextFor = useCallback((session: LiveSession): ContextFactory => (operation, identity = '') => {
    const key = `${session.projectId}:${operation}:${identity}`;
    if (!keys.current.has(key)) keys.current.set(key, `web-${operation}-${crypto.randomUUID()}`);
    return { ...session, correlationId: buildCorrelationId(operation), idempotencyKey: keys.current.get(key) };
  }, []);
  const context = useCallback((operation: string, identity = ''): ProviderRequestContext => {
    const session = sessionRef.current;
    if (!session) throw new Error('Project session is not connected');
    return contextFor(session)(operation, identity);
  }, [contextFor]);

  const beginOperation = useCallback(() => {
    operationGeneration.current += 1;
    return operationGeneration.current;
  }, []);
  const operationIsCurrent = useCallback(
    (requestGeneration: number) => mounted.current && requestGeneration === operationGeneration.current,
    [],
  );

  const beginAgentThread = useCallback(() => {
    activeAgentThreadRef.current = true;
    activeThreadDefinitionRef.current = null;
    selectedIdRef.current = null;
    selectedRunIdRef.current = null;
    newScenarioRef.current = true;
    setState((current) => ({
      ...current,
      selectedDefinition: null,
      variant: null,
      buildJob: null,
      build: null,
      approval: null,
      run: null,
      evaluation: null,
      artifacts: [],
      artifactOutcomes: [],
    }));
  }, []);

  const publishAgentDefinition = useCallback((reference: ActiveThreadDefinitionReference) => {
    if (!activeAgentThreadRef.current) return;
    activeThreadDefinitionRef.current = reference;
    selectedIdRef.current = null;
    selectedRunIdRef.current = null;
    setState((current) => ({ ...current, selectedDefinition: null }));
  }, []);

  const finishAgentThread = useCallback((outcome: 'completed' | 'failed' | 'cancelled') => {
    if (outcome === 'completed') return;
    activeThreadDefinitionRef.current = null;
    selectedIdRef.current = null;
    selectedRunIdRef.current = null;
    setState((current) => ({ ...current, selectedDefinition: null }));
  }, []);

  const fail = (error: unknown) => mounted.current && setState((current) => ({ ...current, stage: 'error', error: message(error), status: 'Request failed' }));
  const refresh = useCallback(async (expected?: { definitionId: string; version: number }): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session) return false;
    const requestGeneration = generation.current;
    const requestOperationGeneration = beginOperation();
    const isCurrent = () => mounted.current
      && requestGeneration === generation.current
      && requestOperationGeneration === operationGeneration.current;
    const boundContext = contextFor(session);
    setState((current) => ({ ...current, stage: 'loading', error: null, status: 'Loading project data' }));
    try {
      let recovery: RecoveryRequiredResult | null = null;
      const savedRecovery = readSavedRecovery(session.projectId);
      if (savedRecovery) {
        try {
          recovery = recoveryProjection(await apiClient.getRecovery(
            savedRecovery,
            boundContext('resume-recovery', savedRecovery),
          ));
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          saveRecovery(session.projectId, null);
        }
      }
      if (!isCurrent()) return false;
      const [definitions, registry] = await Promise.all([
        apiClient.listDefinitions(boundContext('list-definitions'), 100, true),
        loadRegistry(boundContext, isCurrent),
      ]);
      if (!isCurrent() || !registry) return false;
      const definitionItems = definitions.items.map((item) => ({
        ...item,
        archived: item.archived ?? false,
        archived_at: item.archived_at ?? null,
      }));
      const activeThreadDefinition = activeAgentThreadRef.current
        ? activeThreadDefinitionRef.current
        : null;
      const selected = activeAgentThreadRef.current
        ? activeThreadDefinition
          ? definitionItems.find((item) => (
            item.definition.definition_id === activeThreadDefinition.definitionId
              && (activeThreadDefinition.version === null
                ? item.definition_version_id === activeThreadDefinition.definitionVersionId
                : item.definition.version === activeThreadDefinition.version)
          )) ?? null
          : null
        : definitionItems.find(
          (item) => item.definition.definition_id === selectedIdRef.current,
        ) ?? (newScenarioRef.current ? null : definitionItems[0] ?? null);
      if (expected && (
        !selected
        || selected.definition.definition_id !== expected.definitionId
        || selected.definition.version !== expected.version
      )) {
        const error = new Error('The Definition was saved, but the successor is not visible yet. Refresh and retry.');
        if (isCurrent()) setState((current) => ({
          ...current,
          stage: 'ready',
          status: 'Request failed',
          error: error.message,
          definitionRefreshRequired: true,
        }));
        return false;
      }
      selectedIdRef.current = selected?.definition.definition_id ?? null;
      const definitionLineage = selected ? registry.filter(
        (item) => item.definition_id === selected.definition.definition_id
          && item.definition_version === selected.definition.version,
      ) : [];
      const selectedRunLineage = selectedRunIdRef.current
        ? definitionLineage.find((item) => item.run_id === selectedRunIdRef.current)
        : undefined;
      const lineage = selectedRunLineage ?? defaultWorkspaceLineage(definitionLineage);
      const hydrated = lineage ? await loadLineage(lineage, boundContext, isCurrent) : null;
      if (!isCurrent() || (lineage && !hydrated)) return false;
      setState((current) => {
        const definitionChanged = current.selectedDefinition?.definition_version_id !== selected?.definition_version_id;
        const retainSelectedRun = Boolean(
          hydrated
          && current.run
          && current.run.run.build_id === hydrated.build.build_id
          && selectedRunIdRef.current === current.run.run.run_id
          && !selectedRunLineage,
        );
        const retainedApproval = hydrated && current.approval
          && current.approval.build_id === hydrated.build.build_id
          && current.approval.manifest_hash === hydrated.build.manifest_hash
          ? current.approval : null;
        return {
          ...current,
          ...(definitionChanged ? {
            variant: null, buildJob: null, build: null, approval: null, run: null,
            evaluation: null, artifacts: [], artifactOutcomes: [],
          } : {}),
          ...(hydrated ?? {}),
          recovery,
          definitionRefreshRequired: false,
          ...(hydrated ? { approval: retainedApproval } : {}),
          ...(retainSelectedRun ? {
            run: current.run,
            evaluation: current.evaluation,
            artifactOutcomes: current.artifactOutcomes,
          } : {}),
          stage: 'ready', definitions: definitionItems,
          registry, selectedDefinition: selected,
          status: recovery?.recovery.status === 'OPEN'
            ? 'Recovery is waiting for consent'
            : recovery?.recovery.status === 'SUCCESSOR_PUBLISHED'
              ? 'Recovery successor published'
              : recovery?.recovery.status === 'CANCELLED'
                ? 'Recovery cancelled; v1 remains unchanged'
                : 'Project data loaded',
          error: null,
        };
      });
      return true;
    } catch (error) {
      if (isCurrent() && expected) {
        const detail = message(error);
        setState((current) => ({
          ...current,
          stage: 'ready',
          status: 'Request failed',
          error: `${detail} Definition was saved; refresh and retry loading the successor.`,
          definitionRefreshRequired: true,
        }));
      } else if (isCurrent()) fail(error);
      return false;
    }
  }, [beginOperation, contextFor]);

  const connect = useCallback(async (session: LiveSession) => {
    const normalized = { projectId: session.projectId.trim(), projectToken: session.projectToken.trim() };
    const savedSelection = readSavedSelection(normalized.projectId);
    generation.current += 1;
    operationGeneration.current += 1;
    sessionRef.current = normalized;
    activeAgentThreadRef.current = false;
    activeThreadDefinitionRef.current = null;
    selectedIdRef.current = savedSelection.definitionId;
    selectedRunIdRef.current = savedSelection.runId;
    newScenarioRef.current = false;
    keys.current.clear();
    setState({ ...initialState, session: normalized, stage: 'loading', status: 'Connecting project session' });
    await refresh();
  }, [refresh]);

  const disconnect = useCallback(() => {
    // A disconnected view must fence every outstanding response from the old token.
    generation.current += 1;
    operationGeneration.current += 1;
    sessionRef.current = null;
    activeAgentThreadRef.current = false;
    activeThreadDefinitionRef.current = null;
    selectedIdRef.current = null;
    selectedRunIdRef.current = null;
    newScenarioRef.current = false;
    keys.current.clear();
    setState(initialState);
  }, []);

  const selectDefinition = useCallback(async (definitionId: string) => {
    const session = sessionRef.current;
    if (!session) return;
    const requestGeneration = beginOperation();
    const isCurrent = () => operationIsCurrent(requestGeneration);
    const boundContext = contextFor(session);
    newScenarioRef.current = definitionId === '';
    selectedIdRef.current = definitionId || null;
    selectedRunIdRef.current = null;
    saveSelection(session.projectId, { definitionId: selectedIdRef.current, runId: null });
    const selectedDefinition = state.definitions.find((item) => item.definition.definition_id === definitionId) ?? null;
    const lineage = selectedDefinition ? defaultWorkspaceLineage(state.registry.filter(
      (item) => item.definition_id === definitionId && item.definition_version === selectedDefinition.definition.version,
    )) : undefined;
    setState((current) => ({
      ...current, selectedDefinition,
      variant: null, buildJob: null, build: null, approval: null, run: null, evaluation: null, artifacts: [], artifactOutcomes: [],
    }));
    if (!lineage) return;
    try {
      const hydrated = await loadLineage(lineage, boundContext, isCurrent);
      if (!isCurrent() || !hydrated) return;
      setState((current) => ({
        ...current, ...hydrated,
        stage: 'ready', status: `Lineage ${lineage.build_id} loaded`, error: null,
      }));
    } catch (error) { if (isCurrent()) fail(error); }
  }, [beginOperation, contextFor, operationIsCurrent, state.definitions, state.registry]);

  const createDefinition = useCallback(async (description: string) => {
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: 'Creating Definition', error: null }));
    try {
      const result = await apiClient.createProviderDefinition(
        description,
        context('create-definition', `${requestGeneration}:${description}`),
      );
      if (!operationIsCurrent(requestGeneration)) return;
      if (result.definition) {
        newScenarioRef.current = false;
        selectedIdRef.current = result.definition.definition_id;
        selectedRunIdRef.current = null;
        saveSelection(result.definition.project_id, {
          definitionId: selectedIdRef.current,
          runId: null,
        });
        await refresh();
      } else {
        setState((current) => ({ ...current, stage: 'ready', status: `Definition job ${result.job_status}`, error: null }));
      }
    } catch (error) {
      // An identical resubmission is an explicit no-op, not a failure.
      if (error instanceof ApiError && error.status === 409 && error.envelope.code === 'DUPLICATE_CONTENT_HASH') {
        await refresh();
        return;
      }
      if (operationIsCurrent(requestGeneration)) {
        fail(error);
        throw error;
      }
    }
  }, [beginOperation, context, operationIsCurrent, refresh]);

  const patchDefinition = useCallback(async (description: string) => {
    const selected = state.selectedDefinition;
    if (!selected) return;
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: 'Saving Definition edit', error: null }));
    try {
      await apiClient.patchProviderDefinition(selected.definition.definition_id, description, selected.definition.version, context('patch-definition', `${selected.definition.definition_id}:${selected.definition.version}:${description}`));
      if (!operationIsCurrent(requestGeneration)) return;
      await refresh();
    } catch (error) {
      if (operationIsCurrent(requestGeneration)) {
        fail(error);
        throw error;
      }
    }
  }, [beginOperation, context, operationIsCurrent, refresh, state.selectedDefinition]);

  /**
   * Publishes Structured edits as a new DefinitionVersion.
   *
   * `base_version` is the version the operator was looking at, so a provider
   * that has moved on refuses instead of overwriting someone else's work.
   */
  const publishDefinitionEdits = useCallback(async (structuredEdits: readonly { path: string; value: string | number }[]) => {
    if (state.definitionRefreshRequired) return refresh();
    const selected = state.selectedDefinition;
    if (!selected || structuredEdits.length === 0) return false;
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: 'Publishing Definition edit', error: null }));
    try {
      const published = await apiClient.patchProviderDefinition(
        selected.definition.definition_id,
        null,
        selected.definition.version,
        context('publish-definition-edit', `${selected.definition.definition_id}:${selected.definition.version}:${JSON.stringify(structuredEdits)}`),
        structuredEdits,
      );
      if (!operationIsCurrent(requestGeneration)) return false;
      setState((current) => ({
        ...current,
        variant: null,
        buildJob: null,
        build: null,
        approval: null,
        run: null,
        evaluation: null,
        artifacts: [],
        artifactOutcomes: [],
        definitionRefreshRequired: true,
      }));
      return await refresh({
        definitionId: selected.definition.definition_id,
        version: published.definition.version,
      });
    } catch (error) {
      if (operationIsCurrent(requestGeneration)) fail(error);
      return false;
    }
  }, [beginOperation, context, fail, operationIsCurrent, refresh, state.definitionRefreshRequired, state.selectedDefinition]);

  const ground = useCallback(async () => {
    const selected = state.selectedDefinition;
    if (!selected) return;
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: 'Grounding Definition', error: null }));
    try {
      const variant = await apiClient.groundVariant({ definition_id: selected.definition.definition_id, version: selected.definition.version, catalog_constraints: {} }, context('ground', `${selected.definition.definition_id}:${selected.definition.version}`));
      if (!operationIsCurrent(requestGeneration)) return;
      selectedRunIdRef.current = null;
      saveSelection(selected.definition.project_id, { definitionId: selected.definition.definition_id, runId: null });
      setState((current) => ({
        ...current, variant, buildJob: null, build: null, approval: null, run: null,
        evaluation: null, artifacts: [], artifactOutcomes: [], stage: 'ready', status: 'ScenarioVariant grounded',
      }));
    } catch (error) { if (operationIsCurrent(requestGeneration)) fail(error); }
  }, [beginOperation, context, operationIsCurrent, state.selectedDefinition]);

  const refreshRecovery = useCallback(async () => {
    const pending = state.recovery;
    if (!pending) return;
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'loading', status: 'Refreshing recovery status', error: null }));
    try {
      const lock = await apiClient.getRecovery(
        pending.recovery.recovery_id,
        context('recovery-status', pending.recovery.recovery_id),
      );
      if (!operationIsCurrent(requestGeneration)) return;
      const next = recoveryProjection(lock);
      saveRecovery(lock.project_id, lock.recovery_id);
      setState((current) => ({
        ...current,
        recovery: next,
        stage: 'ready',
        status: lock.status === 'OPEN'
          ? 'Recovery is waiting for consent'
          : lock.status === 'SUCCESSOR_PUBLISHED'
            ? 'Recovery successor published'
            : 'Recovery cancelled; v1 remains unchanged',
        error: null,
      }));
    } catch (error) {
      if (!operationIsCurrent(requestGeneration)) return;
      if (error instanceof ApiError && error.status === 404) {
        saveRecovery(pending.recovery.project_id, null);
        setState((current) => ({ ...current, recovery: null, stage: 'ready', status: 'Recovery is no longer available', error: null }));
        return;
      }
      fail(error);
    }
  }, [beginOperation, context, operationIsCurrent, state.recovery]);

  const build = useCallback(async (mode: 'baseline' | 'rag') => {
    if (!state.variant) return;
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: `Dispatching ${mode} Build`, error: null }));
    try {
      const buildContext = context(`build-${mode}`, `${state.variant.content_hash}:${requestGeneration}`);
      let job = await (mode === 'rag'
        ? apiClient.createProviderBuild(state.variant.content_hash, mode, buildContext, state.selectedDefinition?.definition.description)
        : apiClient.createProviderBuild(state.variant.content_hash, mode, buildContext));
      if (!operationIsCurrent(requestGeneration)) return;
      // Publish the job before polling it. A real Build takes minutes, and
      // holding it in a local variable until it finished left the workspace
      // with no way to know one was running: the Build step read as locked and
      // the panel rendered its empty shape the whole time.
      setState((current) => ({ ...current, buildJob: job }));
      job = await pollBuildJob(
        job,
        (jobId) => apiClient.getBuildJob(jobId, context('build-job', jobId)),
        () => operationIsCurrent(requestGeneration),
      );
      if (!operationIsCurrent(requestGeneration)) return;
      if (!job.result?.build_id) {
        const status = job.status.toLowerCase();
        if (['failed', 'cancelled'].includes(status)) {
          const failure = job.failure_class ? ` (${job.failure_class})` : '';
          throw new Error(`Build job ${status}${failure}; no Build was published.`);
        }
        throw new Error(`Build did not publish a build identity after ${BUILD_POLL_ATTEMPTS} seconds.`);
      }
      const record = await apiClient.getProviderBuild(String(job.result.build_id), context('build-read', String(job.result.build_id)));
      if (!operationIsCurrent(requestGeneration)) return;
      const artifacts = await apiClient.getBuildArtifacts(record.build_id, context('build-artifacts', record.build_id));
      if (!operationIsCurrent(requestGeneration)) return;
      selectedRunIdRef.current = null;
      saveSelection(state.selectedDefinition?.definition.project_id ?? '', {
        definitionId: state.selectedDefinition?.definition.definition_id ?? null,
        runId: null,
      });
      setState((current) => ({
        ...current, buildJob: job, build: record, artifacts, approval: null, run: null,
        evaluation: null, artifactOutcomes: [], stage: 'ready', status: `${mode} Build published`,
      }));
    } catch (error) { if (operationIsCurrent(requestGeneration)) fail(error); }
  }, [beginOperation, context, operationIsCurrent, state.selectedDefinition?.definition.description, state.selectedDefinition?.definition.definition_id, state.selectedDefinition?.definition.project_id, state.variant]);

  const groundAndBuild = useCallback(async (mode: 'baseline' | 'rag' = 'baseline') => {
    const selected = state.selectedDefinition;
    if (!selected) return;
    if (state.recovery?.recovery.status === 'OPEN' || state.recovery?.recovery.status === 'SUCCESSOR_PUBLISHED') {
      await refreshRecovery();
      return;
    }
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: `Grounding then dispatching ${mode} Build`, error: null }));
    try {
      const variant = await apiClient.groundVariant(
        {
          definition_id: selected.definition.definition_id,
          version: selected.definition.version,
          catalog_constraints: (() => {
            const mapClaim = selected.claims.find((claim) => claim.field === 'map')?.value;
            return typeof mapClaim === 'string' && mapClaim.trim() ? { reference_id: mapClaim.trim() } : {};
          })(),
        },
        context('ground-build', `${selected.definition.definition_id}:${selected.definition.version}`),
      );
      if (!operationIsCurrent(requestGeneration)) return;
      selectedRunIdRef.current = null;
      saveSelection(selected.definition.project_id, { definitionId: selected.definition.definition_id, runId: null });
      setState((current) => ({
        ...current, variant, buildJob: null, build: null, approval: null, run: null,
        evaluation: null, artifacts: [], artifactOutcomes: [], status: `Dispatching ${mode} Build`, error: null,
      }));

      const buildContext = context(`build-${mode}`, `${variant.content_hash}:${requestGeneration}`);
      let job = await (mode === 'rag'
        ? apiClient.createProviderBuild(variant.content_hash, mode, buildContext, selected.definition.description)
        : apiClient.createProviderBuild(variant.content_hash, mode, buildContext));
      if (!operationIsCurrent(requestGeneration)) return;
      setState((current) => ({ ...current, buildJob: job }));
      job = await pollBuildJob(
        job,
        (jobId) => apiClient.getBuildJob(jobId, context('build-job', jobId)),
        () => operationIsCurrent(requestGeneration),
      );
      if (!operationIsCurrent(requestGeneration)) return;
      if (!job.result?.build_id) {
        const status = job.status.toLowerCase();
        if (['failed', 'cancelled'].includes(status)) {
          const failure = job.failure_class ? ` (${job.failure_class})` : '';
          throw new Error(`Build job ${status}${failure}; no Build was published.`);
        }
        throw new Error(`Build did not publish a build identity after ${BUILD_POLL_ATTEMPTS} seconds.`);
      }
      const record = await apiClient.getProviderBuild(String(job.result.build_id), context('build-read', String(job.result.build_id)));
      if (!operationIsCurrent(requestGeneration)) return;
      const artifacts = await apiClient.getBuildArtifacts(record.build_id, context('build-artifacts', record.build_id));
      if (!operationIsCurrent(requestGeneration)) return;
      setState((current) => ({
        ...current, buildJob: job, build: record, artifacts, approval: null, run: null,
        evaluation: null, artifactOutcomes: [], stage: 'ready', status: `${mode} Build published`, error: null,
      }));
    } catch (error) {
      if (!operationIsCurrent(requestGeneration)) return;
      if (isRecoveryRequired(error)) {
        saveRecovery(selected.definition.project_id, error.envelope.recovery.recovery_id);
        setState((current) => ({
          ...current,
          recovery: recoveryResultFromError(error.envelope),
          stage: 'ready',
          status: 'Recovery is waiting for consent',
          error: null,
        }));
        return;
      }
      fail(error);
      throw error;
    }
  }, [beginOperation, context, operationIsCurrent, refreshRecovery, state.recovery, state.selectedDefinition]);

  const consentRecovery = useCallback(async (decision: 'approve' | 'cancel') => {
    const pending = state.recovery;
    if (!pending || pending.recovery.recovery_id.length === 0 || pending.recovery.status !== 'OPEN') return;
    const requestGeneration = beginOperation();
    setState((current) => ({
      ...current,
      stage: 'submitting',
      status: decision === 'approve' ? 'Recording recovery consent' : 'Cancelling recovery',
      error: null,
    }));
    try {
      const result = decision === 'approve'
        ? await apiClient.consentRecovery(
          pending.recovery.recovery_id,
          { decision, expected_state_version: pending.recovery.state_version },
          context('recovery-consent', `${pending.recovery.recovery_id}:${pending.recovery.state_version}:${decision}`),
        )
        : await apiClient.cancelRecovery(
          pending.recovery.recovery_id,
          pending.recovery.state_version,
          context('recovery-cancel', `${pending.recovery.recovery_id}:${pending.recovery.state_version}`),
        );
      if (!operationIsCurrent(requestGeneration)) return;
      const next = recoveryProjection(result.recovery);
      saveRecovery(result.recovery.project_id, result.recovery.recovery_id);
      setState((current) => ({
        ...current,
        recovery: next,
        stage: 'ready',
        status: decision === 'approve'
          ? 'Recovery consent recorded; v1 remains unchanged'
          : 'Recovery cancelled; v1 remains unchanged',
        error: null,
      }));
    } catch (error) {
      if (operationIsCurrent(requestGeneration)) {
        if (error instanceof ApiError && error.envelope.code === 'STALE_RECOVERY_STATE') {
          await refresh();
          return;
        }
        fail(error);
      }
    }
  }, [beginOperation, context, operationIsCurrent, refresh, state.recovery]);

  const approve = useCallback(async () => {
    if (!state.build) return;
    const requestGeneration = beginOperation();
    try {
      const approval = await apiClient.approveBuild(state.build.build_id, { manifest_hash: state.build.manifest_hash, decision: 'approved' }, context('approval', `${state.build.build_id}:${state.build.manifest_hash}`));
      if (!operationIsCurrent(requestGeneration)) return;
      setState((current) => ({ ...current, approval, status: 'Exact Build manifest approved', stage: 'ready', error: null }));
    } catch (error) { if (operationIsCurrent(requestGeneration)) fail(error); }
  }, [beginOperation, context, operationIsCurrent, state.build]);

  const dispatchRun = useCallback(async (mode: 'smoke' | 'full', seed: number) => {
    const build = state.build;
    if (!build || !hasExactApproval(build, state.approval)) return false;
    const requestGeneration = beginOperation();
    try {
      const dispatched = await apiClient.createRun({ build_id: build.build_id, manifest_hash: build.manifest_hash, seed, mode }, context('run', `${build.build_id}:${mode}:${seed}`));
      if (!operationIsCurrent(requestGeneration)) return false;
      const run = await apiClient.getRunView(dispatched.run_id, context('run-read', dispatched.run_id));
      if (!operationIsCurrent(requestGeneration)) return false;
      selectedRunIdRef.current = dispatched.run_id;
      saveSelection(state.selectedDefinition?.definition.project_id ?? '', {
        definitionId: state.selectedDefinition?.definition.definition_id ?? null,
        runId: dispatched.run_id,
      });
      setState((current) => ({
        ...current, run, evaluation: null, artifactOutcomes: [],
        status: `${mode} Run ${dispatched.run_id} dispatched`, stage: 'ready', error: null,
      }));

      // The Run endpoint and registry are eventually consistent. Keep the
      // selected Run visible immediately, then refresh status, evaluation and
      // signed artifact URLs in the background until terminal evidence exists.
      const initialEvidence: RunEvidenceSnapshot = {
        run,
        evaluation: null,
        artifactOutcomes: [],
        registry: state.registry,
      };
      setState((current) => ({ ...current, runEvidencePending: true }));
      void (async () => {
        let evidence = initialEvidence;
        try {
          evidence = await pollRunEvidence(
            evidence,
            () => readRunEvidence(dispatched.run_id, evidence, context, () => operationIsCurrent(requestGeneration)),
            runEvidenceReady,
            () => operationIsCurrent(requestGeneration),
            wait,
            RUN_POLL_ATTEMPTS,
            (snapshot) => {
              evidence = snapshot;
              if (!operationIsCurrent(requestGeneration)) return;
              setState((current) => ({ ...current, registry: snapshot.registry, run: snapshot.run, evaluation: snapshot.evaluation, artifactOutcomes: snapshot.artifactOutcomes, status: `${mode} Run ${dispatched.run_id} evidence refreshing`, stage: 'ready', error: null }));
            },
          );
          if (!operationIsCurrent(requestGeneration)) return;
          setState((current) => ({
            ...current,
            registry: evidence.registry,
            run: evidence.run,
            evaluation: evidence.evaluation,
            artifactOutcomes: evidence.artifactOutcomes,
            status: runEvidenceReady(evidence)
              ? `${mode} Run ${dispatched.run_id} evidence loaded`
              : `${mode} Run ${dispatched.run_id} still running — evidence refresh timed out`,
            stage: 'ready', error: null,
          }));
        } catch (error) {
          if (operationIsCurrent(requestGeneration)) fail(error);
        } finally {
          // Whether the evidence arrived, timed out or failed, the workspace has
          // stopped waiting for it — and the panel must stop waiting with it.
          if (operationIsCurrent(requestGeneration)) {
            setState((current) => ({ ...current, runEvidencePending: false }));
          }
        }
      })();
      return true;
    } catch (error) {
      if (operationIsCurrent(requestGeneration)) {
        fail(error);
        throw error;
      }
      return false;
    }
  }, [beginOperation, context, operationIsCurrent, state.approval, state.build, state.registry, state.selectedDefinition?.definition.definition_id, state.selectedDefinition?.definition.project_id]);

  const loadRun = useCallback(async (runId: string) => {
    const requestGeneration = beginOperation();
    try {
      const run = await apiClient.getRunView(runId, context('run-read', runId));
      if (!operationIsCurrent(requestGeneration)) return false;
      selectedRunIdRef.current = runId;
      const lineage = state.registry.find((item) => item.run_id === runId);
      const selectedDefinition = lineage
        ? state.definitions.find((item) => item.definition.definition_id === lineage.definition_id) ?? null
        : state.selectedDefinition;
      if (selectedDefinition) selectedIdRef.current = selectedDefinition.definition.definition_id;
      saveSelection(state.session?.projectId ?? '', {
        definitionId: selectedDefinition?.definition.definition_id ?? null,
        runId,
      });
      let evaluation = null;
      if (['succeeded', 'failed', 'scenario failure'].includes(run.status.toLowerCase())) {
        try { evaluation = await apiClient.getEvaluation(runId, context('evaluation', runId)); }
        catch (error) {
          if (!(error instanceof ApiError) || ![404, 501].includes(error.status)) throw error;
        }
      }
      if (!operationIsCurrent(requestGeneration)) return false;
      const artifactOutcomes = lineage ? await Promise.all(lineage.artifact_ids.map((id) => apiClient.getRegistryArtifact(id, context('artifact', id)))) : [];
      if (!operationIsCurrent(requestGeneration)) return false;
      setState((current) => ({ ...current, selectedDefinition, run, evaluation, artifactOutcomes, status: 'Run evidence loaded', stage: 'ready', error: null }));
      return true;
    } catch (error) {
      if (operationIsCurrent(requestGeneration)) fail(error);
      return false;
    }
  }, [beginOperation, context, operationIsCurrent, state.definitions, state.registry, state.selectedDefinition, state.session?.projectId]);

  const cancelRun = useCallback(async () => {
    if (!state.run) return;
    const requestGeneration = beginOperation();
    try {
      const cancelled = await apiClient.cancelRun(state.run.run.run_id, context('cancel-run', state.run.run.run_id));
      if (!operationIsCurrent(requestGeneration)) return;
      const view = await apiClient.getRunView(cancelled.run_id, context('run-read', cancelled.run_id));
      if (!operationIsCurrent(requestGeneration)) return;
      setState((current) => ({ ...current, run: view, status: 'Run cancellation requested', stage: 'ready', error: null }));
    } catch (error) { if (operationIsCurrent(requestGeneration)) fail(error); }
  }, [beginOperation, context, operationIsCurrent, state.run]);

  const archiveDefinition = useCallback(async (definitionId: string) => {
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: 'Archiving Definition', error: null }));
    try {
      await apiClient.archiveProviderDefinition(definitionId, context('archive-definition', definitionId));
      if (!operationIsCurrent(requestGeneration)) return;
      if (selectedIdRef.current === definitionId) selectedIdRef.current = null;
      if (selectedIdRef.current === null) {
        selectedRunIdRef.current = null;
        saveSelection(state.session?.projectId ?? '', { definitionId: null, runId: null });
      }
      await refresh();
    } catch (error) { if (operationIsCurrent(requestGeneration)) fail(error); }
  }, [beginOperation, context, operationIsCurrent, refresh, state.session?.projectId]);

  const restoreDefinition = useCallback(async (definitionId: string) => {
    const requestGeneration = beginOperation();
    setState((current) => ({ ...current, stage: 'submitting', status: 'Restoring Definition', error: null }));
    try {
      await apiClient.restoreProviderDefinition(definitionId, context('restore-definition', definitionId));
      if (!operationIsCurrent(requestGeneration)) return;
      await refresh();
    } catch (error) { if (operationIsCurrent(requestGeneration)) fail(error); }
  }, [beginOperation, context, operationIsCurrent, refresh]);

  const compareBuilds = useCallback(async (leftBuildId: string, rightBuildId: string) => {
    const requestGeneration = beginOperation();
    try {
      const comparison = await apiClient.compareRegistry(leftBuildId, rightBuildId, context('registry-compare', `${leftBuildId}:${rightBuildId}`));
      if (!operationIsCurrent(requestGeneration)) return null;
      setState((current) => ({ ...current, status: `Comparison: ${comparison.build_changes.length} Build change(s)`, stage: 'ready', error: null }));
      return comparison;
    } catch (error) {
      if (operationIsCurrent(requestGeneration)) {
        fail(error);
        throw error;
      }
      return null;
    }
  }, [beginOperation, context, operationIsCurrent]);

  const replay = useCallback(async (item: LiveWorkspaceState['registry'][number]) => {
    if (item.run_seed === null) return null;
    const requestGeneration = beginOperation();
    try {
      const result = await apiClient.replayRegistry(item.build_id, item.manifest_hash, item.run_seed, context('registry-replay', `${item.build_id}:${item.run_seed}`));
      if (!operationIsCurrent(requestGeneration)) return null;
      setState((current) => ({ ...current, status: `Replay ${result.run_id} dispatched`, stage: 'ready', error: null }));
      await refresh();
      return result.run_id;
    } catch (error) {
      if (operationIsCurrent(requestGeneration)) {
        fail(error);
        throw error;
      }
      return null;
    }
  }, [beginOperation, context, operationIsCurrent, refresh]);

  return { state, connect, disconnect, refresh, refreshRecovery, selectDefinition, createDefinition, patchDefinition, publishDefinitionEdits, ground, build, groundAndBuild, consentRecovery, approve, dispatchRun, loadRun, cancelRun, archiveDefinition, restoreDefinition, compareBuilds, replay, beginAgentThread, publishAgentDefinition, finishAgentThread };
}
