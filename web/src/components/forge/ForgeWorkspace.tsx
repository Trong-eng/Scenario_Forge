'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { PanelLeftOpen, X } from 'lucide-react';
import { DefinitionPanel } from './DefinitionPanel';
import { ForgeSidebar } from './ForgeSidebar';
import { InspectorPanel } from './InspectorPanel';
import { getFocusableElements, ModalOverlay, trapModalFocus } from './ModalOverlay';
import { fieldGroupTemplate as initialGroups, type DefinitionTab, type FieldGroup } from './definitionModel';
import { createProjectSession } from '@/shared/api/client';
import { useLiveWorkspace } from './useLiveWorkspace';
import { buildStructuredDefinitionEdits, isIrEditableField, projectFieldGroups } from './liveProjection';
import { structuredSpeedRange } from './definitionModel';
import { SettingsDialog, readSettingsSectionFromUrl } from './settings/SettingsDialog';
import type { SectionId } from './settings/sections';
import { usePreferences } from '@/shared/preferences/PreferencesContext';
import { useT, type MessageKey } from '@/shared/i18n';
import { useGlobalShortcuts } from '@/shared/shortcuts/useGlobalShortcuts';
import { useTerminology } from './useTerminology';
import { ScenarioLibrary } from './ScenarioLibrary';
import { RunsWorkspace } from './RunsWorkspace';
import { TemplatesWorkspace } from './TemplatesWorkspace';
import { AgentThreadPanel } from './AgentThreadPanel';
import { CapabilitiesPanel } from './CapabilitiesPanel';
import { useAgentThreadIndex } from './useAgentThreadIndex';
import { deriveCapabilityCatalogView, capabilityIntent as buildCapabilityIntent, type CapabilityCatalogView } from '@/shared/api/capabilityTypes';
import { apiClient } from '@/shared/api/client';
import { buildCorrelationId, type ActiveThreadDefinitionReference } from './useLiveWorkspace';
import type { AgentThread } from '@/shared/api/agentTypes';
import type { RecoveryRequiredResult } from '@/shared/api/schemas';
import { hasExactApproval, panePreferenceKey } from './workspacePanes';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { WorkspaceSplitLayout } from './WorkspaceSplitLayout';
import { defaultBuildGenerationMode, type BuildGenerationMode } from './buildGenerationMode';
import {
  applyCanvasMilestone,
  deriveCanvasSteps,
  deriveWorkspaceGuideState,
  supersedeDownstreamSteps,
  builderRailDefaultFraction,
  layoutPreferenceKey,
  nextAutoStep,
  parseWorkspaceLayoutPreference,
  serializeWorkspaceLayoutPreference,
  type CanvasStep,
  type CanvasPresentation,
  type WorkspaceLayoutPreference,
} from './workspaceCanvasModel';

const ease = [0.4, 0, 0.2, 1] as const;
const compactWorkspaceQuery = '(max-width: 968px)';

/** Module scope has no hook, so the state maps to a key and the caller resolves
 *  it -- the label has to follow the chosen language, not the module's load. */
function agentThreadStatus(status: string): { state: 'working' | 'passed' | 'failed' | 'draft'; labelKey: MessageKey } {
  switch (status.toLowerCase()) {
    case 'active':
    case 'running':
      return { state: 'working', labelKey: 'thread.state.working' };
    case 'completed':
      return { state: 'passed', labelKey: 'thread.state.passed' };
    case 'failed':
      return { state: 'failed', labelKey: 'thread.state.failed' };
    default:
      return { state: 'draft', labelKey: 'thread.state.draft' };
  }
}

function getViewportMedia(query: string, fallbackMatches: boolean) {
  if (typeof window.matchMedia === 'function') return window.matchMedia(query);
  return {
    matches: fallbackMatches,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

const recoveryReasonCopy: Record<string, string> = {
  UNSUPPORTED_SEMANTICS: 'The published scenario uses semantics that need one deliberate clarification before grounding.',
};

export function RecoveryCard({
  recovery,
  busy,
  onConsent,
  onRefresh,
}: {
  recovery: RecoveryRequiredResult;
  busy: boolean;
  onConsent: (decision: 'approve' | 'cancel') => void;
  onRefresh?: () => void;
}) {
  const lock = recovery.recovery;
  const isOpen = lock.status === 'OPEN';
  const isApproved = lock.consent_state === 'APPROVED';
  const terminalCopy = lock.terminal_outcome === 'PUBLISHED_BEFORE_CANCEL'
    ? 'A v2 was published before cancellation; the workspace will reconcile its progress.'
    : lock.terminal_outcome === 'CANCELLED_AFTER_PUBLISH'
      ? 'Cancellation arrived after publication; v1 remains unchanged and the workspace will reconcile v2.'
      : lock.terminal_outcome === 'BUDGET_EXHAUSTED_AFTER_PUBLISH'
        ? 'Recovery budget ended after publication; v1 remains unchanged and the result is preserved.'
        : lock.status === 'CANCELLED'
          ? 'Recovery cancelled. Definition v1 remains unchanged.'
          : lock.status === 'SUCCESSOR_PUBLISHED'
            ? 'Definition v2 was published as the direct successor. Definition v1 remains unchanged.'
            : null;

  return <section role="region" aria-label="Definition recovery" className="mx-auto mt-4 max-w-2xl rounded-xl border border-primary/30 bg-primary/5 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[length:calc(13px*var(--font-scale))] font-semibold">Definition v1 remains unchanged</p>
        <p className="mt-1 text-[length:calc(13px*var(--font-scale))] leading-relaxed text-muted-foreground">
          {terminalCopy ?? (isApproved
            ? 'Consent recorded. The linked recovery can continue through review before any v2 is published.'
            : recoveryReasonCopy[recovery.reason_code] ?? 'The published scenario needs explicit recovery before grounding.')}
        </p>
      </div>
      <span className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[length:calc(11px*var(--font-scale))] font-semibold text-muted-foreground">
        {lock.status === 'OPEN' && !isApproved ? 'Consent needed' : lock.status === 'OPEN' ? 'Recovery in progress' : 'Recovery recorded'}
      </span>
    </div>
    {isOpen && !isApproved ? <div className="mt-3 flex flex-wrap gap-2">
      {recovery.allowed_actions.includes('approve') ? <button type="button" disabled={busy} onClick={() => onConsent('approve')} className="rounded-lg bg-primary px-3 py-2 text-[length:calc(13px*var(--font-scale))] font-semibold text-primary-foreground disabled:opacity-45">Create v2 and keep v1 unchanged</button> : null}
      {recovery.allowed_actions.includes('cancel') ? <button type="button" disabled={busy} onClick={() => onConsent('cancel')} className="rounded-lg border border-border bg-card px-3 py-2 text-[length:calc(13px*var(--font-scale))] font-semibold disabled:opacity-45">Cancel and leave v1 as-is</button> : null}
      {recovery.allowed_actions.includes('refresh') && onRefresh ? <button type="button" disabled={busy} onClick={onRefresh} className="rounded-lg border border-border bg-card px-3 py-2 text-[length:calc(13px*var(--font-scale))] font-semibold text-muted-foreground disabled:opacity-45">Refresh recovery status</button> : null}
    </div> : null}
  </section>;
}

export function ForgeWorkspace() {
  const t = useT();
  const terminology = useTerminology();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState('workspace');
  const [selectedScenario, setSelectedScenario] = useState('s1');
  const [irOpen, setIrOpen] = useState(false);
  const [definitionTab, setDefinitionTab] = useState<DefinitionTab>('structured');
  // Field edits the operator has made, keyed `groupId:fieldId`. They used to be
  // written to a `groups` state that nothing rendered, so every change was
  // discarded the moment it was made and the pending count could never leave 0.
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [submittedEdits, setSubmittedEdits] = useState<Record<string, string>>({});
  const [workspaceNotes, setWorkspaceNotes] = useState<{ id: string; text: string }[]>([]);
  // The Build a Definition edit invalidated. Everything downstream was grounded
  // from values the operator has since changed, so presenting it as finished
  // would vouch for artifacts that no longer match what is on screen. Clears by
  // itself once a different Build exists.
  const [supersededBuildId, setSupersededBuildId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [seed, setSeed] = useState('42');
  const [buildGenerationMode, setBuildGenerationMode] = useState<BuildGenerationMode>(() => defaultBuildGenerationMode());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SectionId | undefined>(undefined);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [agentResetKey, setAgentResetKey] = useState(0);
  const [compactSidebar, setCompactSidebar] = useState(false);
  const [layoutPreference, setLayoutPreference] = useState<WorkspaceLayoutPreference>({
    version: 2,
    canvasOpen: false,
    activeStep: 'structured',
    chatFraction: builderRailDefaultFraction,
    discoveredSteps: [],
  });
  const [loadedLayoutScope, setLoadedLayoutScope] = useState<string | null>(null);
  const [compactSurface, setCompactSurface] = useState<'chat' | 'canvas'>('chat');
  const [compactSplitLayout, setCompactSplitLayout] = useState(false);
  const [canvasPresentation, setCanvasPresentation] = useState<Exclude<CanvasPresentation, 'closed'>>('split');
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [capabilityIntent, setCapabilityIntent] = useState<string | null>(null);
  const [capabilityView, setCapabilityView] = useState<CapabilityCatalogView>({ kind: 'loading' });
  const irTriggerRef = useRef<HTMLButtonElement>(null);
  const irDialogRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const buildPanelRef = useRef<HTMLElement>(null);
  const runPanelRef = useRef<HTMLElement>(null);
  const capabilitiesReturnFocusRef = useRef<HTMLElement | null>(null);
  const capabilitiesDialogRef = useRef<HTMLElement>(null);
  const manuallyCollapsedCanvasRef = useRef(false);
  const canvasReturnFocusRef = useRef<HTMLElement | null>(null);
  const previousGuideStepRef = useRef<CanvasStep>('structured');
  const sidebarReturnFocusRef = useRef<HTMLElement | null>(null);
  const shouldRestoreSidebarFocusRef = useRef(false);

  // Provider wiring. The workspace authorises with a project-scoped token, which
  // is a different credential from the login JWT, so the session is exchanged for
  // one on mount instead of asking the operator to paste it in.
  const live = useLiveWorkspace();
  const { beginAgentThread, finishAgentThread, publishAgentDefinition, refresh: refreshLive } = live;
  const agentThreadIndex = useAgentThreadIndex(live.state.session);
  const { upsertThread, refresh: refreshThreads } = agentThreadIndex;
  const liveRef = useRef(live);
  liveRef.current = live;
  const [providerError, setProviderError] = useState<string | null>(null);
  const connectRef = useRef(false);

  // A selected conversation owns Canvas provenance for its lifetime. Starting
  // from a clean thread also fences the project-wide Definition fallback.
  useEffect(() => {
    if (agentThreadIndex.selectedThreadId) beginAgentThread();
  }, [agentThreadIndex.selectedThreadId, beginAgentThread]);

  useEffect(() => {
    if (connectRef.current) return;
    connectRef.current = true;
    void createProjectSession()
      .then((session) => {
        setPermissions(session.permissions);
        return live.connect({ projectId: session.project_id, projectToken: session.project_token });
      })
      .then(() => {
        setProviderError(null);
        setStatus('Scenario Forge provider ready');
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : 'Provider unavailable';
        setProviderError(reason);
        setStatus(reason);
      });
  }, [live]);

  // Capability catalogue: real versioned metadata (SCENARIO-002 TIP-006).
  // The pane is read-only and never leaks ScenarioIR/source/telemetry.
  useEffect(() => {
    const session = live.state.session;
    if (!session) {
      setCapabilityView({ kind: 'loading' });
      return;
    }
    let cancelled = false;
    setCapabilityView({ kind: 'loading' });
    const correlationId = buildCorrelationId('capabilities-list');
    try {
      const fetcher = (apiClient as unknown as { getCapabilities?: (...args: unknown[]) => Promise<unknown> }).getCapabilities;
      if (typeof fetcher !== 'function') {
        setCapabilityView({ kind: 'unavailable' });
        return () => {
          cancelled = true;
        };
      }
      const maybePromise = fetcher(
        { projectId: session.projectId, projectToken: session.projectToken, correlationId },
        { include_planned: true, include_experimental: true },
      );
      if (!maybePromise || typeof (maybePromise as Promise<unknown>).then !== 'function') {
        setCapabilityView({ kind: 'unavailable' });
        return () => {
          cancelled = true;
        };
      }
      void (maybePromise as Promise<unknown>)
        .then((result) => {
          if (cancelled) return;
          setCapabilityView(deriveCapabilityCatalogView(result as unknown as import('@/shared/api/capabilityTypes').CapabilityListResult));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const envelope = (error as { envelope?: { code?: string; message?: string; retryable?: boolean } })?.envelope;
          if (envelope?.code && envelope?.message) {
            if (envelope.code === 'CAPABILITY_PROVIDER_UNAVAILABLE' || envelope.code === 'CAPABILITY_PROVIDER_FAILED') {
              setCapabilityView({
                kind: 'unavailable',
                errorCode: envelope.code,
                summary: envelope.message,
              });
              return;
            }
            setCapabilityView({
              kind: 'error',
              code: String(envelope.code).slice(0, 64),
              message: String(envelope.message).slice(0, 512),
              retryable: Boolean(envelope.retryable),
            });
            return;
          }
          setCapabilityView({
            kind: 'unavailable',
            summary: error instanceof Error ? error.message.slice(0, 512) : undefined,
          });
        });
    } catch {
      setCapabilityView({ kind: 'unavailable' });
    }
    return () => {
      cancelled = true;
    };
  }, [live.state.session]);

  // Recent is conversation history, not a list of published Definitions. A
  // draft/refused thread must remain reachable even when interpretation never
  // produced a DefinitionVersion.
  const liveScenarios = agentThreadIndex.threads.map((item) => ({
    id: item.thread_id,
    title: item.title,
    state: agentThreadStatus(item.status).state,
    meta: t(agentThreadStatus(item.status).labelKey),
  }));

  useEffect(() => {
    if (agentThreadIndex.selectedThreadId) setSelectedScenario(agentThreadIndex.selectedThreadId);
  }, [agentThreadIndex.selectedThreadId]);

  useEffect(() => {
    const compactMedia = getViewportMedia(compactWorkspaceQuery, window.innerWidth <= 968);
    const syncViewport = () => {
      const compact = compactMedia.matches;
      setCompactSidebar(compact);
      if (compact) {
        setSidebarOpen(false);
      }
    };
    syncViewport();
    compactMedia.addEventListener('change', syncViewport);
    return () => {
      compactMedia.removeEventListener('change', syncViewport);
    };
  }, []);

  const { preferences, update: updatePreferences } = usePreferences();
  const preferenceSeed = preferences.run.defaultSeed;
  const effectiveSeed = preferenceSeed || seed;
  useEffect(() => { if (preferenceSeed) setSeed(preferenceSeed); }, [preferenceSeed]);
  const openSettings = useCallback((section?: SectionId) => {
    settingsReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSettingsSection(section ?? readSettingsSectionFromUrl());
    setSettingsOpen(true);
  }, []);
  useGlobalShortcuts(useMemo(() => ({
    openSettings: () => openSettings(),
    openShortcuts: () => openSettings('shortcuts'),
    focusComposer: () => document.getElementById('agent-thread-message')?.focus(),
    toggleSidebar: () => setSidebarOpen((open) => !open),
  }), [openSettings]), !settingsOpen);

  const closeIr = useCallback(() => setIrOpen(false), []);

  const openSidebar = () => {
    if (compactSidebar) {
      sidebarReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setSidebarOpen(true);
  };

  useEffect(() => {
    if (!compactSidebar || !sidebarOpen) return;
    let frame = 0;
    const focusWhenVisible = () => {
      const dialog = sidebarRef.current;
      if (!dialog?.isConnected || dialog.getAttribute('role') !== 'dialog') return;
      const [firstControl] = getFocusableElements(dialog);
      if (!firstControl) {
        frame = window.requestAnimationFrame(focusWhenVisible);
        return;
      }
      firstControl.focus();
    };
    frame = window.requestAnimationFrame(focusWhenVisible);
    return () => window.cancelAnimationFrame(frame);
  }, [compactSidebar, sidebarOpen]);

  const closeSidebar = useCallback(() => {
    if (compactSidebar) shouldRestoreSidebarFocusRef.current = true;
    setSidebarOpen(false);
  }, [compactSidebar]);

  useEffect(() => {
    if (!compactSidebar || sidebarOpen || !shouldRestoreSidebarFocusRef.current) return;
    shouldRestoreSidebarFocusRef.current = false;
    const timeout = window.setTimeout(() => {
      const target = sidebarReturnFocusRef.current?.isConnected
        ? sidebarReturnFocusRef.current
        : document.querySelector<HTMLElement>('[data-testid="header-nav-trigger"]');
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [compactSidebar, sidebarOpen]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || irOpen || capabilitiesOpen) return;
      if (compactSidebar && sidebarOpen) closeSidebar();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [capabilitiesOpen, closeSidebar, compactSidebar, irOpen, sidebarOpen]);

  const updateField = (groupId: string, fieldId: string, value: string) => {
    setFieldEdits((current) => ({ ...current, [`${groupId}:${fieldId}`]: value }));
    setStatus(`Updated ${fieldId} to ${value} locally`);
  };

  /**
   * Publish the operator's closed Structured edits as an immutable successor.
   */
  const submitFieldEdits = () => {
    if (pendingEdits === 0 || !selected) return;
    const summary = changedFields.map((field) => field.label).join(' · ');
    const edits = buildStructuredDefinitionEdits(fieldEdits);
    if (edits.length === 0) return;
    // Back to the step the operator can act on: the ones after it are locked.
    previousGuideStepRef.current = layoutPreference.activeStep;
    setLayoutPreference((current) => ({ ...current, activeStep: 'structured' }));
    setStatus(t('status.publishing', { count: pendingEdits }));
    void live.publishDefinitionEdits(edits).then((published) => {
      if (published) {
        setSubmittedEdits({ ...fieldEdits });
        setFieldEdits({});
        setSupersededBuildId(currentBuildId);
      }
      setWorkspaceNotes((current) => [...current, {
        id: `edit-${Date.now()}`,
        text: published
          ? t('status.published', { count: pendingEdits, summary })
          : live.state.definitionRefreshRequired
            ? t('status.publishedStale', { count: pendingEdits, summary })
            : t('status.publishRejected', { count: pendingEdits, summary }),
      }]);
      setStatus(published
        ? t('status.publishedShort', { count: pendingEdits })
        : t('status.editFailed'));
    });
  };

  const copyText = (text: string, label: string) => {
    if (!navigator.clipboard?.writeText) {
      setStatus(`${label} copy is unavailable in this browser`);
      return;
    }
    setStatus(`${label} copied`);
    void navigator.clipboard.writeText(text).catch(() => setStatus(`${label} copy failed — select the visible value and copy it manually`));
  };

  // Building moves the Canvas to Build the way dispatching moves it to Run, so
  // the surface follows the step the operator just started.
  const openBuildStep = () => {
    previousGuideStepRef.current = layoutPreference.activeStep;
    manuallyCollapsedCanvasRef.current = false;
    setLayoutPreference((current) => ({ ...current, canvasOpen: true, activeStep: 'build' }));
    setCompactSurface('canvas');
  };

  const startRun = (kind: 'Smoke' | 'Full') => {
    const normalizedSeed = effectiveSeed.trim() || '42';
    if (!effectiveSeed.trim()) setSeed(normalizedSeed);
    if (!live.state.session) {
      setStatus(t('status.noProvider'));
      return;
    }
    if (!hasExactApproval(live.state.build, live.state.approval)) {
      previousGuideStepRef.current = layoutPreference.activeStep;
      manuallyCollapsedCanvasRef.current = false;
      setLayoutPreference((current) => ({ ...current, canvasOpen: true, activeStep: 'build' }));
      setCompactSurface('canvas');
      setStatus(t('status.runLocked'));
      return;
    }
    previousGuideStepRef.current = layoutPreference.activeStep;
    manuallyCollapsedCanvasRef.current = false;
    setLayoutPreference((current) => ({ ...current, canvasOpen: true, activeStep: 'run' }));
    setCompactSurface('canvas');
    setStatus(t('status.dispatching', { kind: t(kind === 'Smoke' ? 'run.kind.smoke' : 'run.kind.full') }));
    void Promise.resolve(live.dispatchRun(kind === 'Smoke' ? 'smoke' : 'full', Number(normalizedSeed)))
      .then((dispatched) => setStatus(dispatched ? t('status.runDispatched', { kind: t(kind === 'Smoke' ? 'run.kind.smoke' : 'run.kind.full'), seed: normalizedSeed }) : t('status.runRejected')))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : t('status.runRefused', { kind: t(kind === 'Smoke' ? 'run.kind.smoke' : 'run.kind.full') })));
  };

  const approveBuild = () => {
    if (!live.state.session) {
      setApproved((value) => !value);
      setStatus(approved ? 'Build approval removed locally' : 'Build approved locally');
      return;
    }
    setStatus('Approving exact manifest…');
    void Promise.resolve(live.approve())
      .then(() => setStatus('Manifest approved by provider'))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'Approval refused'));
  };

  const copyManifest = () => copyText(live.state.build?.manifest_hash ?? 'e3b0c442…', 'Manifest hash');

  // Inspector data is a compact provider projection. Runtime and media evidence
  // stay in the Run pane and are never fabricated before the provider responds.
  const liveInspector = live.state.session ? (() => {
    const st = live.state;
    const readiness = hasExactApproval(st.build, st.approval) ? 'Ready to run'
      : st.build ? 'Approval required'
      : st.variant ? 'Ready to build'
      : 'Grounding required';
    const runStatus = String(st.run?.status ?? '').toLowerCase();
    // A Run reaches a terminal status before its signed video URL is published,
    // so the wait has to follow the evidence poll too. Ending it on status alone
    // showed a "no video" frame that the next poll immediately contradicted.
    const runInFlight = Boolean(st.run)
      && (!['succeeded', 'completed', 'failed', 'cancelled', 'canceled'].includes(runStatus) || st.runEvidencePending);
    return {
      seed,
      buildLabel: st.build ? t('build.seedLabel', { id: st.build.build_id.slice(0, 12), seed }) : t('build.none'),
      readiness,
      busy: st.buildJob && !st.build
        ? { kind: 'build' as const, label: t('busy.build.label'), detail: t('busy.build.detail') }
        : runInFlight
          ? { kind: 'run' as const, label: t('busy.run.label'), detail: t('busy.run.detail') }
          : null,
      preflight: st.build
        ? [
            { label: t('preflight.buildPublished'), state: 'pass' as const },
            { label: t('preflight.manifestHash'), state: 'hash' as const, value: st.build.manifest_hash },
          ]
        : [],
      run: st.run,
      evaluation: st.evaluation,
      artifacts: st.artifactOutcomes,
    };
  })() : null;

  // Provider-owned view. While a Definition is selected the header and the IR
  // editor read from the provider; otherwise the approved intake state stays
  // empty instead of inventing a local Definition.
  const selected = live.state.selectedDefinition;
  const currentBuildId = live.state.build?.build_id ?? null;
  const downstreamSuperseded = Boolean(supersededBuildId && currentBuildId === supersededBuildId);
  const canvasStepViews = useMemo(
    () => supersedeDownstreamSteps(deriveCanvasSteps(live.state), downstreamSuperseded),
    [downstreamSuperseded, live.state],
  );
  const layoutScope = live.state.session
    ? layoutPreferenceKey(live.state.session.projectId, agentThreadIndex.selectedThreadId ?? 'new')
    : null;

  useEffect(() => {
    if (loadedLayoutScope === layoutScope) return;
    setLoadedLayoutScope(null);
    if (!layoutScope) {
      manuallyCollapsedCanvasRef.current = false;
      setLayoutPreference({ version: 2, canvasOpen: false, activeStep: 'structured', chatFraction: builderRailDefaultFraction, discoveredSteps: [] });
      setCanvasPresentation('split');
      return;
    }
    const session = live.state.session;
    const threadId = agentThreadIndex.selectedThreadId ?? 'new';
    const legacyKey = session ? panePreferenceKey(session.projectId, threadId) : null;
    const stored = parseWorkspaceLayoutPreference(
      window.localStorage.getItem(layoutScope) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null),
    );
    const advanced = [...canvasStepViews].reverse().find((step) => step.state !== 'locked')?.id ?? 'structured';
    const active = stored && canvasStepViews.some((step) => step.id === stored.activeStep && step.state !== 'locked')
      ? stored.activeStep
      : advanced;
    const nextPreference: WorkspaceLayoutPreference = stored
      ? { ...stored, activeStep: active }
      : {
          version: 2,
          canvasOpen: Boolean(selected),
          activeStep: advanced,
          chatFraction: builderRailDefaultFraction,
          discoveredSteps: canvasStepViews.filter((step) => step.state !== 'locked').map((step) => step.id),
        };
    manuallyCollapsedCanvasRef.current = Boolean(stored && !stored.canvasOpen);
    setLayoutPreference(nextPreference);
    setCompactSurface(nextPreference.canvasOpen ? 'canvas' : 'chat');
    setCanvasPresentation('split');
    setLoadedLayoutScope(layoutScope);
  }, [agentThreadIndex.selectedThreadId, canvasStepViews, layoutScope, live.state.session, loadedLayoutScope, selected]);

  useEffect(() => {
    if (!layoutScope || loadedLayoutScope !== layoutScope) return;
    const next = nextAutoStep(live.state, layoutPreference.discoveredSteps);
    if (!next) return;
    setLayoutPreference((current) => applyCanvasMilestone(current, next, manuallyCollapsedCanvasRef.current));
    if (!manuallyCollapsedCanvasRef.current) setCompactSurface('canvas');
  }, [layoutPreference.discoveredSteps, layoutScope, live.state, loadedLayoutScope]);

  useEffect(() => {
    if (!layoutScope || loadedLayoutScope !== layoutScope) return;
    window.localStorage.setItem(layoutScope, serializeWorkspaceLayoutPreference(layoutPreference));
  }, [layoutPreference, layoutScope, loadedLayoutScope]);

  const selectCanvasStep = useCallback((step: CanvasStep) => {
    if (canvasStepViews.find((candidate) => candidate.id === step)?.state === 'locked') return;
    previousGuideStepRef.current = layoutPreference.activeStep;
    manuallyCollapsedCanvasRef.current = false;
    setLayoutPreference((current) => ({ ...current, canvasOpen: true, activeStep: step }));
    setCompactSurface('canvas');
  }, [canvasStepViews, layoutPreference.activeStep]);

  const availableDefinitionTabs = useMemo<DefinitionTab[]>(() => ['structured'], []);

  useEffect(() => {
    if (!availableDefinitionTabs.includes(definitionTab)) setDefinitionTab(availableDefinitionTabs[0]!);
  }, [availableDefinitionTabs, definitionTab]);

  const connected = Boolean(live.state.session);
  // Connected with nothing selected is a real, empty state. Showing design data
  // here would present an invented scenario as if the provider held it.
  const providerGroups = selected
    ? projectFieldGroups(selected, live.state.variant, initialGroups, preferences.locale.language, terminology)
    : [];
  // What the panel shows: the provider's values with the operator's edits on
  // top, so a control keeps the value it was given.
  const liveGroups = providerGroups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      // Only six of the twelve controls have somewhere to be written back:
      // three are grounding bindings that belong to a build request, and three
      // have no source at all. The rest show their value and refuse the edit.
      if (!isIrEditableField(group.id, field.id)) {
        return {
          ...field,
          readOnlyReason: field.id === 'map' || field.id === 'location' || field.id === 'conflict'
            ? t('field.groundedNote')
            : t('field.noProviderField'),
        };
      }
      const edited = fieldEdits[`${group.id}:${field.id}`];
      if (edited === undefined || edited === field.value) return field;
      if (field.numericValue) {
        const numericDraft = Number(edited);
        const invalidRange = edited.trim() !== '' && (!Number.isFinite(numericDraft) || numericDraft < structuredSpeedRange.min || numericDraft > structuredSpeedRange.max);
        return {
          ...field,
          value: edited,
          numericDraft: edited,
          validationMessage: invalidRange ? `Speed must be between ${structuredSpeedRange.min} and ${structuredSpeedRange.max}.` : undefined,
          provenance: 'user' as const,
        };
      }
      return { ...field, value: edited, provenance: 'user' as const };
    }),
  }));
  const canvasArtifact = useMemo(() => {
    if (!selected) return undefined;
    const step = [...canvasStepViews].reverse().find((candidate) => candidate.state !== 'locked') ?? canvasStepViews[0];
    const stateLabel = step.state === 'complete'
      ? t('step.state.done')
      : step.state === 'working'
        ? t('step.state.working')
        : step.state === 'failed'
          ? t('step.state.review')
          : t('step.state.ready');
    const description = step.id === 'run'
      ? t('step.detail.run')
      : step.id === 'build'
        ? t('step.detail.build')
        : t('step.detail.structured');
    return {
      title: t('def.versionTitle', { version: selected.definition.version }),
      description,
      meta: `${t(step.labelKey)} · ${stateLabel}`,
      step: step.id,
    };
  }, [canvasStepViews, selected]);


  // Edits that differ from the provider's value and have not been submitted
  // yet. The old version compared the provider's groups against themselves, so
  // it always answered 0 whatever the operator did.
  const changedFields = providerGroups.flatMap((group) => group.fields.flatMap((field) => {
    const key = `${group.id}:${field.id}`;
    const edited = fieldEdits[key];
    return edited === undefined || edited === field.value ? [] : [{ key, label: `${field.label}: ${edited}`, value: edited }];
  }));
  const pendingEdits = changedFields.filter((field) => submittedEdits[field.key] !== field.value).length;

  // A Build can be started from the Structured footer or from the agent, and it
  // takes minutes. Whoever started it, the Canvas follows: leaving the operator
  // on a finished Structured while work happens elsewhere is what made the
  // workspace look idle.
  const openedBuildForJobRef = useRef<string | null>(null);
  useEffect(() => {
    const job = live.state.buildJob;
    if (!job || live.state.build) return;
    if (openedBuildForJobRef.current === job.job_id) return;
    openedBuildForJobRef.current = job.job_id;
    previousGuideStepRef.current = layoutPreference.activeStep;
    manuallyCollapsedCanvasRef.current = false;
    setLayoutPreference((current) => ({ ...current, canvasOpen: true, activeStep: 'build' }));
    setCompactSurface('canvas');
  }, [layoutPreference.activeStep, live.state.build, live.state.buildJob]);

  const navigationModalOpen = compactSidebar && sidebarOpen;
  const guide = deriveWorkspaceGuideState(canvasStepViews, layoutPreference.activeStep, previousGuideStepRef.current);
  const canvasOpen = Boolean(selected) && layoutPreference.canvasOpen;
  const openCanvas = (requestedStep: CanvasStep = layoutPreference.activeStep) => {
    if (!selected) return;
    const step = canvasStepViews.find((candidate) => candidate.id === requestedStep && candidate.state !== 'locked')?.id
      ?? layoutPreference.activeStep;
    canvasReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    manuallyCollapsedCanvasRef.current = false;
    setLayoutPreference((current) => ({ ...current, canvasOpen: true, activeStep: step }));
    setCanvasPresentation('split');
    setCompactSurface('canvas');
  };
  const closeCanvas = () => {
    manuallyCollapsedCanvasRef.current = true;
    setCanvasPresentation('split');
    setLayoutPreference((current) => ({ ...current, canvasOpen: false }));
    setCompactSurface('chat');
    window.setTimeout(() => {
      const target = canvasReturnFocusRef.current;
      if (target?.isConnected) target.focus();
    }, 0);
  };
  const activeCanvasPresentation: CanvasPresentation = canvasOpen ? canvasPresentation : 'closed';
  const stage = canvasOpen ? 'authoring' : 'intake';
  const startNewScenario = () => {
    agentThreadIndex.clearSelection();
    setAgentResetKey((current) => current + 1);
    setSelectedScenario('new');
    setFieldEdits({});
    setSubmittedEdits({});
    setWorkspaceNotes([]);
    setSupersededBuildId(null);
    setDefinitionTab('structured');
    setApproved(false);
    manuallyCollapsedCanvasRef.current = false;
    setLayoutPreference({
      version: 2,
      canvasOpen: false,
      activeStep: 'structured',
      chatFraction: builderRailDefaultFraction,
      discoveredSteps: [],
    });
    setCanvasPresentation('split');
    setCompactSurface('chat');
    if (live.state.session) void live.selectDefinition('');
    setActiveNav('workspace');
    setStatus(t('status.readyForNew'));
  };

  const selectedAgentThreadTitle = agentThreadIndex.threads.find(
    (thread) => thread.thread_id === agentThreadIndex.selectedThreadId,
  )?.title ?? null;
  const handleAgentThreadUpdated = useCallback((thread: AgentThread) => {
    beginAgentThread();
    upsertThread(thread);
  }, [beginAgentThread, upsertThread]);
  const handleAgentThreadSettled = useCallback((outcome: 'completed' | 'failed' | 'cancelled') => {
    finishAgentThread(outcome);
    void refreshThreads();
  }, [finishAgentThread, refreshThreads]);
  const handleAgentDefinitionPublished = useCallback((reference: ActiveThreadDefinitionReference) => {
    publishAgentDefinition(reference);
    void refreshLive();
  }, [publishAgentDefinition, refreshLive]);

  return (
    <MotionConfig reducedMotion="user">
    <div data-testid="forge-background" data-canvas-presentation={activeCanvasPresentation} className="forge-root flex h-dvh min-h-0 w-full max-w-full overflow-hidden bg-background">
      <ForgeSidebar
        concealed={activeCanvasPresentation === 'fullscreen'}
        open={sidebarOpen}
        active={activeNav}
        selectedScenario={selectedScenario}
        onToggle={() => sidebarOpen ? closeSidebar() : openSidebar()}
        onSelect={(id, label) => { setActiveNav(id); setStatus(`${label} opened`); }}
        onNewScenario={startNewScenario}
        onSelectScenario={(id, title, meta) => {
          if (!agentThreadIndex.selectThread(id)) return;
          setSelectedScenario(id);
          if (live.state.session) {
            live.beginAgentThread();
            setStatus(t('status.restoringThread'));
            void Promise.resolve(live.selectDefinition(''))
              .then(() => setStatus(`${title} loaded from provider`))
              .catch((error: unknown) => setStatus(error instanceof Error ? error.message : t('status.threadOpenFailed')));
          }
        }}
        onRenameScenario={(id, title) => Promise.resolve(agentThreadIndex.renameThread(id, title))
          .then(() => setStatus(t('status.threadRenamed')))
          .catch((error: unknown) => setStatus(error instanceof Error ? error.message : t('status.renameFailed')))}
        modal={navigationModalOpen}
        sidebarRef={sidebarRef}
        onSidebarKeyDown={(event) => { if (compactSidebar) trapModalFocus(event); }}
        onOpenSettings={() => openSettings()}
        scenarios={liveScenarios}
      />
      {compactSidebar && sidebarOpen ? <div aria-hidden="true" data-testid="navigation-backdrop" onClick={closeSidebar} className="fixed inset-0 z-[25] bg-foreground/20 backdrop-blur-[2px]" /> : null}

      <div data-testid="workspace-shell" aria-hidden={navigationModalOpen || undefined} inert={(navigationModalOpen ? '' : undefined) as unknown as boolean} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!sidebarOpen && compactSidebar ? <button type="button" onClick={openSidebar} aria-label={t('sidebar.openFromHeader')} data-testid="header-nav-trigger" className="absolute left-3 top-3 z-20 icon-button shadow-sm"><PanelLeftOpen aria-hidden="true" className="size-4" /></button> : null}
        {activeNav === 'library' ? (
          <ScenarioLibrary
            definitions={live.state.definitions}
            registry={live.state.registry}
            onSelect={(id) => {
                if (!id) {
                  startNewScenario();
                  return;
                }
                setStatus(t('status.openingDefinition'));
                void live.selectDefinition(id).then(() => {
                  previousGuideStepRef.current = layoutPreference.activeStep;
                  manuallyCollapsedCanvasRef.current = false;
                  setSelectedScenario(id);
                  setDefinitionTab('structured');
                  setLayoutPreference((current) => ({
                    ...current,
                    canvasOpen: true,
                    activeStep: 'structured',
                    discoveredSteps: current.discoveredSteps.includes('structured')
                      ? current.discoveredSteps
                      : ['structured', ...current.discoveredSteps],
                  }));
                  setCanvasPresentation('split');
                  setCompactSurface('canvas');
                  setActiveNav('workspace');
                  setStatus('Definition opened in Structured Canvas');
                });
            }}
            onReplay={async (item) => {
              const runId = await live.replay(item);
              if (!runId) return null;
              setActiveNav('runs');
              return await live.loadRun(runId) ? runId : null;
            }}
            onCompare={(left, right) => live.compareBuilds(left, right)}
          />
        ) : null}

        {activeNav === 'runs' ? (
          <RunsWorkspace
            registry={live.state.registry}
            run={live.state.run}
            evaluation={live.state.evaluation}
            artifactOutcomes={live.state.artifactOutcomes}
            onSelect={(runId) => live.loadRun(runId)}
            onCancel={() => void Promise.resolve(live.cancelRun()).catch((e: unknown) => setStatus(e instanceof Error ? e.message : 'Cancel refused'))}
            onCompare={(left, right) => live.compareBuilds(left, right)}
          />
        ) : null}

        {activeNav === 'templates' ? <TemplatesWorkspace /> : null}

        {activeNav === 'workspace' && live.state.recovery ? <RecoveryCard
          recovery={live.state.recovery}
          busy={live.state.stage === 'submitting'}
          onConsent={(decision) => { void live.consentRecovery(decision); }}
          onRefresh={() => { void live.refreshRecovery(); }}
        /> : null}
        <main hidden={activeNav !== 'workspace'} data-stage={stage} className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceSplitLayout
            canvasOpen={canvasOpen}
            chatFraction={layoutPreference.chatFraction}
            onChatFractionChange={(chatFraction) => setLayoutPreference((current) => ({ ...current, chatFraction }))}
            compactSurface={compactSurface}
            onCompactSurfaceChange={setCompactSurface}
            onLayoutModeChange={setCompactSplitLayout}
            chat={<div id="workspace-panel-agent" className="h-full min-h-0 min-w-0 overflow-hidden">{live.state.session ? <AgentThreadPanel session={live.state.session} selectedThreadId={agentThreadIndex.selectedThreadId} selectedThreadTitle={selectedAgentThreadTitle} resetKey={agentResetKey} onThreadUpdated={handleAgentThreadUpdated} onThreadSettled={handleAgentThreadSettled} pendingIntent={capabilityIntent} onPendingIntentConsumed={() => setCapabilityIntent(null)} onOpenCapabilities={() => { capabilitiesReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setCapabilitiesOpen(true); }} canvasArtifact={canvasArtifact} onOpenCanvas={selected ? openCanvas : undefined} workspaceNotes={workspaceNotes} onDefinitionPublished={handleAgentDefinitionPublished} /> : null}</div>}
            canvas={<WorkspaceCanvas
              steps={canvasStepViews}
              activeStep={layoutPreference.activeStep}
              guide={guide}
              runProgress={live.state.run ? {
                completedSteps: live.state.run.progress.completed_steps,
                totalSteps: live.state.run.progress.total_steps,
              } : undefined}
              runTerminal={Boolean(live.state.run && ['succeeded', 'completed', 'failed', 'cancelled', 'canceled'].includes(String(live.state.run.status).toLowerCase()))}
              onStepChange={selectCanvasStep}
              presentation={canvasPresentation}
              fullscreenAvailable={!compactSidebar && !compactSplitLayout}
              onPresentationChange={setCanvasPresentation}
              onClose={closeCanvas}
              structured={<DefinitionPanel
                tab={definitionTab}
                availableTabs={availableDefinitionTabs}
                groups={liveGroups}
                pendingEdits={pendingEdits}
                inspectorOpen={false}
                inspectorAvailable={false}
                onTabChange={setDefinitionTab}
                onFieldChange={updateField}
                onCompare={() => { setDefinitionTab('diff'); setStatus(t('status.noDiffContract')); }}
                onSubmit={submitFieldEdits}
                onOpenInspector={() => undefined}
                onGroundAndBuild={live.state.build && !downstreamSuperseded ? undefined : () => { openBuildStep(); void live.groundAndBuild(buildGenerationMode); }}
                generationMode={buildGenerationMode}
                onGenerationModeChange={setBuildGenerationMode}
                onOpenBuild={live.state.build && !downstreamSuperseded ? openBuildStep : undefined}
                buildSubmitting={Boolean(live.state.buildJob && !live.state.build)}
              />}
              build={<InspectorPanel
                embedded
                mode="build"
                live={liveInspector}
                idle={connected && !selected}
                approved={live.state.session ? hasExactApproval(live.state.build, live.state.approval) : approved}
                seed={seed}
                scenicSource={live.state.build?.scenic_source ?? null}
                onClose={() => { manuallyCollapsedCanvasRef.current = true; setLayoutPreference((current) => ({ ...current, canvasOpen: false })); }}
                onApprove={approveBuild}
                onCopyManifest={copyManifest}
                onCopyScenic={() => {
                  const source = live.state.build?.scenic_source;
                  if (!source) { setStatus(t('status.noScenicSource')); return; }
                  copyText(source, 'Scenic code');
                }}
                onSeedChange={setSeed}
                onRun={startRun}
                overlay={false}
                panelRef={buildPanelRef}
                onPanelKeyDown={() => undefined}
                showClose={false}
              />}
              run={<InspectorPanel
                embedded
                mode="run"
                live={liveInspector}
                idle={connected && !selected}
                approved={live.state.session ? hasExactApproval(live.state.build, live.state.approval) : approved}
                seed={seed}
                run={liveInspector?.run ?? null}
                evaluation={liveInspector?.evaluation ?? null}
                artifacts={liveInspector?.artifacts ?? []}
                onClose={() => { manuallyCollapsedCanvasRef.current = true; setLayoutPreference((current) => ({ ...current, canvasOpen: false })); }}
                onApprove={approveBuild}
                onCopyManifest={copyManifest}
                onSeedChange={setSeed}
                onRun={startRun}
                overlay={false}
                panelRef={runPanelRef}
                onPanelKeyDown={() => undefined}
                showClose={false}
              />}
            />}
          />
        </main>
        {live.state.error ? (
          <div role="alert" aria-live="assertive" className="border-t border-destructive/25 bg-destructive/8 px-4 py-2 text-[length:calc(12px*var(--font-scale))] text-destructive">
            {live.state.error}
          </div>
        ) : null}
      </div>

      {settingsOpen ? (
        <SettingsDialog
          session={live.state.session}
          permissions={permissions}
          initialSection={settingsSection}
          returnFocusRef={settingsReturnFocusRef}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{status}</div>

      {capabilitiesOpen ? <ModalOverlay name="capabilities" backdropTestId="capabilities-backdrop" dialogRef={capabilitiesDialogRef} onClose={() => setCapabilitiesOpen(false)} restoreFocusRef={capabilitiesReturnFocusRef}>
        {(onKeyDown) => <motion.aside ref={capabilitiesDialogRef} role="dialog" aria-modal="true" aria-labelledby="capabilities-title" onKeyDown={onKeyDown} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.28, ease }} className="pointer-events-auto fixed top-0 right-0 z-50 flex h-full w-[30rem] max-w-full flex-col border-l border-border bg-card shadow-float">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 id="capabilities-title" className="text-[length:calc(14px*var(--font-scale))] font-semibold">Capabilities</h2><button type="button" onClick={() => setCapabilitiesOpen(false)} aria-label="Close capabilities" className="icon-button"><X aria-hidden="true" className="size-4" /></button></div>
          <div className="min-h-0 flex-1 overflow-hidden"><CapabilitiesPanel view={capabilityView} session={live.state.session} onSelect={(selection) => {
            const intent = buildCapabilityIntent(selection.capabilityId, selection.displayName);
            setCapabilityIntent(intent);
            setCapabilitiesOpen(false);
          }} /></div>
        </motion.aside>}
      </ModalOverlay> : null}

      {irOpen ? (
        <ModalOverlay name="ir" backdropTestId="ir-backdrop" dialogRef={irDialogRef} onClose={closeIr} restoreFocusRef={irTriggerRef}>
          {(onKeyDown) => (
            <motion.aside
              ref={irDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ir-title"
              onKeyDown={onKeyDown}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.42, ease }}
              className="pointer-events-auto fixed top-0 right-0 z-50 flex h-full w-[30rem] max-w-full flex-col border-l border-border bg-card shadow-float"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div><h2 id="ir-title" className="text-[length:calc(13.5px*var(--font-scale))] font-semibold">{t('ir.title')}</h2><div className="font-mono text-[length:calc(11px*var(--font-scale))] text-muted-foreground">{selected ? `ir/v${selected.definition.version}.json` : 'Chưa có Definition'}</div></div>
                <button type="button" onClick={closeIr} aria-label="Close IR" className="icon-button"><X aria-hidden="true" className="size-4" /></button>
              </div>
              {selected ? (
                <pre className="scroll-slim flex-1 overflow-auto p-4 font-mono text-[length:calc(12px*var(--font-scale))] leading-relaxed text-foreground/85">{JSON.stringify(selected.logical_ir, null, 2)}</pre>
              ) : (
                <p className="p-4 text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">{t('ir.pickDefinition')}</p>
              )}
            </motion.aside>
          )}
        </ModalOverlay>
      ) : null}
    </div>
    </MotionConfig>
  );
}
