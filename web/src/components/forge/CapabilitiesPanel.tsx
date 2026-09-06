'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CAPABILITY_SET_VERSION,
  CAPABILITY_SUPPORT_STATE_LABEL,
  CAPABILITY_STATUS_LABEL,
  EVIDENCE_LEVEL_LABEL,
  isSafeCapabilityReference,
  type CapabilityCatalogView,
  type CapabilityCheckResult,
  type CapabilityMetadataItem,
  isCapabilitySelectable,
} from '@/shared/api/capabilityTypes';
import { apiClient } from '@/shared/api/client';

import { useT } from '@/shared/i18n';
/**
 * Capabilities Workspace pane — SCENARIO-002 real metadata projection.
 *
 * This pane is a read-only projection. It can never create a Definition,
 * dispatch a Build, or start a Run; the only interaction it supports is
 * handing one bounded capability ID back to the AgentThreadPanel composer.
 * Capability truth arrives through `view`; this component never invents
 * capability names, evidence thresholds or registry versions of its own.
 *
 * Lifecycle truth: planned/overtake is visible but non-runnable and
 * non-selectable. No ScenarioIR, renderer source or telemetry is rendered.
 */

// Re-export view derivation for tests; the pure projection lives in
// capabilityTypes but the pane seam must expose it for verification.
export type { CapabilityCatalogView } from '@/shared/api/capabilityTypes';
export { deriveCapabilityCatalogView } from '@/shared/api/capabilityTypes';

function statusBadgeClass(status: CapabilityMetadataItem['status']) {
  switch (status) {
    case 'stable':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'experimental':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'planned':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    case 'deprecated':
    case 'disabled':
      return 'border-red-200 bg-red-50 text-red-600';
    default:
      return 'border-border text-muted-foreground';
  }
}

function evidenceBadgeClass(level: CapabilityMetadataItem['evidence_level']) {
  switch (level) {
    case 'evaluation_verified':
    case 'carla_verified':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'static_validated':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'parsed':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    default:
      return 'border-border text-muted-foreground';
  }
}

export type CapabilitySelection = {
  capabilityId: string;
  displayName: string;
  kind: CapabilityMetadataItem['kind'];
};

const EMPTY_CAPABILITY_CHECKS: Readonly<Record<string, CapabilityCheckResult | undefined>> = {};

export function CapabilitiesPanel({
  view,
  onSelect,
  session,
  checkByCapabilityId = EMPTY_CAPABILITY_CHECKS,
  onRequestCheck,
}: {
  view: CapabilityCatalogView;
  /** Bounded selection: only an ID (and display name for intent). No raw source. */
  onSelect: (selection: CapabilitySelection) => void;
  /** Optional session for bounded check/detail projection (safe_alternatives). */
  session?: { projectId: string; projectToken: string } | null;
  /** Optional check projections supplied by a composed parent or test seam. */
  checkByCapabilityId?: Readonly<Record<string, CapabilityCheckResult | undefined>>;
  /** Called when a detail row is expanded; this is read-only preflight only. */
  onRequestCheck?: (capabilityId: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'primitive' | 'pattern'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CapabilityMetadataItem['status']>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<'all' | CapabilityMetadataItem['evidence_level']>('all');
  const [topologyFilter, setTopologyFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, CapabilityCheckResult | null>>({});
  const [checkLoading, setCheckLoading] = useState<Record<string, boolean>>({});
  const checkResultsRef = useRef<Record<string, CapabilityCheckResult | null>>({});
  const checkLoadingRef = useRef<Record<string, boolean>>({});

  // Hooks must be called unconditionally before early returns.
  const allCapabilities = useMemo<readonly CapabilityMetadataItem[]>(
    () => (view.kind === 'ready' ? view.capabilities : []),
    [view],
  );
  const isReady = view.kind === 'ready';

  // Collect topologies for filter dropdown
  const allTopologies = useMemo(() => {
    const set = new Set<string>();
    for (const item of allCapabilities) {
      for (const topo of item.supported_topologies) set.add(topo);
    }
    return Array.from(set).sort();
  }, [allCapabilities]);

  const filtered = useMemo(() => {
    if (!isReady) return [] as readonly CapabilityMetadataItem[];
    const needle = query.trim().toLowerCase();
    return allCapabilities.filter((item) => {
      if (needle) {
        const haystack = `${item.capability_id} ${item.display_name}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (evidenceFilter !== 'all' && item.evidence_level !== evidenceFilter) return false;
      if (topologyFilter !== 'all' && !item.supported_topologies.includes(topologyFilter as never)) return false;
      return true;
    });
  }, [allCapabilities, isReady, query, kindFilter, statusFilter, evidenceFilter, topologyFilter]);

  const selectableCount = useMemo(() => filtered.filter(isCapabilitySelectable).length, [filtered]);

  // Bounded check for safe_alternatives when a non-selectable item is expanded.
  // This uses the real POST /capabilities/check (read-only, no dispatch) and
  // never echoes raw input. The result is redacted and versioned.
  useEffect(() => {
    if (!expandedId || !session || !isReady) return;
    const item = allCapabilities.find((c) => c.capability_id === expandedId);
    if (!item || checkByCapabilityId[expandedId] !== undefined) return;
    if (checkResultsRef.current[expandedId] !== undefined || checkLoadingRef.current[expandedId]) return;
    let cancelled = false;
    checkLoadingRef.current[expandedId] = true;
    setCheckLoading((prev) => ({ ...prev, [expandedId]: true }));
    const correlationId = `cap-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = { projectId: session.projectId, projectToken: session.projectToken, correlationId };
    // Use the typed client; it validates and redacts the envelope.
    const maybePromise = apiClient.checkCapabilities(ctx, {
      capability_ids: [expandedId],
      capability_set_version: CAPABILITY_SET_VERSION,
    });
    void maybePromise
      .then((result) => {
        if (cancelled) return;
        checkResultsRef.current[expandedId] = result;
        setCheckResults((prev) => ({ ...prev, [expandedId]: result }));
      })
      .catch(() => {
        if (cancelled) return;
        checkResultsRef.current[expandedId] = null;
        setCheckResults((prev) => ({ ...prev, [expandedId]: null }));
      })
      .finally(() => {
        checkLoadingRef.current[expandedId] = false;
        if (!cancelled) setCheckLoading((prev) => ({ ...prev, [expandedId]: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [expandedId, session, isReady, allCapabilities, checkByCapabilityId]);

  if (view.kind === 'loading') {
    return (
      <section className="flex h-full flex-col gap-2 p-4" aria-busy="true" data-testid="capabilities-loading">
        <h2 className="text-sm font-semibold">{t('cap.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('cap.loading')}</p>
      </section>
    );
  }
  if (view.kind === 'empty') {
    return (
      <section className="flex h-full flex-col gap-2 p-4" data-testid="capabilities-empty">
        <h2 className="text-sm font-semibold">{t('cap.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('cap.empty')}</p>
      </section>
    );
  }
  if (view.kind === 'unavailable') {
    return (
      <section className="flex h-full flex-col gap-2 p-4" data-testid="capabilities-unavailable">
        <h2 className="text-sm font-semibold">{t('cap.title')}</h2>
        <p className="text-sm text-muted-foreground">
          Danh mục năng lực tạm thời không khả dụng. Vui lòng thử lại sau.
        </p>
        {view.errorCode ? (
          <p className="text-xs text-muted-foreground" data-testid="capabilities-unavailable-code">
            Mã lỗi: {view.errorCode}
          </p>
        ) : null}
        {view.summary ? <p className="text-xs text-muted-foreground">{view.summary}</p> : null}
      </section>
    );
  }
  if (view.kind === 'stale-version') {
    return (
      <section className="flex h-full flex-col gap-2 p-4" data-testid="capabilities-stale">
        <h2 className="text-sm font-semibold">{t('cap.title')}</h2>
        <p className="text-sm text-muted-foreground">
          Phiên bản danh mục không khớp với ứng dụng. Cập nhật lại trang để xem năng lực hiện có.
        </p>
        <p className="text-xs text-muted-foreground">
          Expected {view.expectedVersion}, got {view.actualVersion}
        </p>
      </section>
    );
  }
  if (view.kind === 'error') {
    return (
      <section className="flex h-full flex-col gap-2 p-4" data-testid="capabilities-error">
        <h2 className="text-sm font-semibold">{t('cap.title')}</h2>
        <p className="text-sm text-destructive">{view.message}</p>
        <p className="text-xs text-muted-foreground">Mã lỗi: {view.code}</p>
      </section>
    );
  }

  // view.kind === 'ready' — filtered/allTopologies/selectableCount are already memoised above.
  return (
    <section className="flex h-full flex-col gap-3 overflow-y-auto p-4" data-testid="capabilities-ready">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('cap.title')}</h2>
        <span className="text-xs text-muted-foreground" data-testid="capabilities-version">
          Phiên bản {view.version} · {view.capabilities.length} mục
        </span>
      </div>
      {view.summary ? <p className="text-xs text-muted-foreground line-clamp-2">{view.summary}</p> : null}
      <p className="text-xs text-muted-foreground">
        Chọn một năng lực để bắt đầu mô tả kịch bản trong khung Agent. Mục <em>Planned</em> hiển thị nhưng không thể
        chọn trực tiếp.
      </p>

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface/50 p-2">
        <label className="sr-only" htmlFor="capabilities-search">
          Tìm kiếm năng lực
        </label>
        <input
          id="capabilities-search"
          data-testid="capabilities-search"
          type="search"
          placeholder={t('cap.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-[length:calc(13px*var(--font-scale))] outline-none focus:ring-2 focus:ring-ring/30"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[length:calc(11px*var(--font-scale))] font-medium text-muted-foreground">
            Kind
            <select
              data-testid="capabilities-filter-kind"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as never)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-[length:calc(13px*var(--font-scale))] text-foreground outline-none"
            >
              <option value="all">All</option>
              <option value="primitive">Primitive</option>
              <option value="pattern">Pattern</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[length:calc(11px*var(--font-scale))] font-medium text-muted-foreground">
            Status
            <select
              data-testid="capabilities-filter-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as never)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-[length:calc(13px*var(--font-scale))] text-foreground outline-none"
            >
              <option value="all">All</option>
              <option value="stable">Stable</option>
              <option value="experimental">Experimental</option>
              <option value="planned">{t('cap.planned')}</option>
              <option value="deprecated">Deprecated</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[length:calc(11px*var(--font-scale))] font-medium text-muted-foreground">
            Evidence
            <select
              data-testid="capabilities-filter-evidence"
              value={evidenceFilter}
              onChange={(event) => setEvidenceFilter(event.target.value as never)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-[length:calc(13px*var(--font-scale))] text-foreground outline-none"
            >
              <option value="all">All</option>
              <option value="parsed">Parsed</option>
              <option value="static_validated">{t('cap.staticValidated')}</option>
              <option value="carla_verified">{t('cap.carlaVerified')}</option>
              <option value="evaluation_verified">{t('cap.evaluationVerified')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[length:calc(11px*var(--font-scale))] font-medium text-muted-foreground">
            Topology
            <select
              data-testid="capabilities-filter-topology"
              value={topologyFilter}
              onChange={(event) => setTopologyFilter(event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-[length:calc(13px*var(--font-scale))] text-foreground outline-none"
            >
              <option value="all">All</option>
              {allTopologies.map((topo) => (
                <option key={topo} value={topo}>
                  {topo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="text-[length:calc(11px*var(--font-scale))] text-muted-foreground" data-testid="capabilities-filter-summary">
          Hiển thị {filtered.length}/{allCapabilities.length} · Chọn được {selectableCount}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="capabilities-empty-filter">
          Không tìm thấy năng lực phù hợp với bộ lọc.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" role="list" data-testid="capabilities-list">
          {filtered.map((capability) => {
            const selectable = isCapabilitySelectable(capability);
            const isExpanded = expandedId === capability.capability_id;
            const isPlanned = capability.status === 'planned' || capability.support_state === 'planned';
            const capabilityCheck = checkByCapabilityId[capability.capability_id] ?? checkResults[capability.capability_id];
            const detailCapability = capabilityCheck?.items.find(
              (item) => item.capability_id === capability.capability_id,
            ) ?? capability;
            const safeAlternatives = capabilityCheck?.safe_alternatives
              .filter(isSafeCapabilityReference)
              .slice(0, 8) ?? [];
            return (
              <li
                key={capability.capability_id}
                data-testid={`capability-${capability.capability_id}`}
                data-capability-status={capability.status}
                data-capability-selectable={String(selectable)}
              >
                <div className="rounded-md border border-border bg-card p-3 text-left">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      const nextExpanded = isExpanded ? null : capability.capability_id;
                      setExpandedId(nextExpanded);
                      if (nextExpanded) onRequestCheck?.(nextExpanded);
                    }}
                    aria-expanded={isExpanded}
                    aria-controls={`capability-detail-${capability.capability_id}`}
                    data-testid={`capability-toggle-${capability.capability_id}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{capability.display_name}</span>
                      <span className="flex items-center gap-1">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[length:calc(11px*var(--font-scale))] uppercase tracking-wide ${statusBadgeClass(capability.status)}`}
                          data-testid={`capability-status-${capability.capability_id}`}
                        >
                          {CAPABILITY_STATUS_LABEL[capability.status]}
                        </span>
                        <span
                          className={`hidden rounded-full border px-2 py-0.5 text-[length:calc(11px*var(--font-scale))] uppercase tracking-wide sm:inline ${evidenceBadgeClass(capability.evidence_level)}`}
                        >
                          {EVIDENCE_LEVEL_LABEL[capability.evidence_level]}
                        </span>
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono text-[length:calc(11px*var(--font-scale))]">{capability.capability_id}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[length:calc(11px*var(--font-scale))] uppercase">{capability.kind}</span>
                      <span data-testid={`capability-support-${capability.capability_id}`}>
                        {CAPABILITY_SUPPORT_STATE_LABEL[capability.support_state]} · {capability.evidence_level}
                      </span>
                    </span>
                  </button>

                  {/* Collapsed summary */}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {capability.required_fields.length ? (
                      <span>Yêu cầu: {capability.required_fields.join(', ')}</span>
                    ) : (
                      <span>Không yêu cầu trường bổ sung</span>
                    )}
                  </div>

                  {/* Expanded detail — AC-003 */}
                  {isExpanded ? (
                    <div
                      id={`capability-detail-${capability.capability_id}`}
                      className="mt-3 rounded-md border border-border bg-surface/50 p-3"
                      data-testid={`capability-detail-${capability.capability_id}`}
                    >
                      <div className="grid gap-2 text-xs">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">Version & scope</span>
                          <span className="text-muted-foreground">
                            Capability set {capabilityCheck?.capability_set_version ?? CAPABILITY_SET_VERSION} ·{' '}
                            {detailCapability.kind} · {detailCapability.status} · {detailCapability.support_state} ·{' '}
                            {detailCapability.evidence_level}
                          </span>
                          <span className="text-muted-foreground">
                            Topologies: {detailCapability.supported_topologies.join(', ') || '—'} · Actors:{' '}
                            {detailCapability.supported_actor_types.join(', ') || '—'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">Required fields</span>
                          <span className="text-muted-foreground">
                            {detailCapability.required_fields.length
                              ? detailCapability.required_fields.join(', ')
                              : 'None'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">Expected events</span>
                          <span className="text-muted-foreground">
                            {detailCapability.expected_events.length ? detailCapability.expected_events.join(', ') : '—'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">Allowed next actions</span>
                          <span className="text-muted-foreground">
                            {detailCapability.allowed_next_actions.join(', ') || '—'}
                          </span>
                        </div>
                        {isExpanded ? (
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-foreground">Read-only preflight</span>
                            {checkLoading[capability.capability_id] ? (
                              <span className="text-muted-foreground" data-testid={`capability-check-loading-${capability.capability_id}`}>
                                Đang kiểm tra…
                              </span>
                            ) : capabilityCheck === null ? (
                              <span className="text-muted-foreground" data-testid={`capability-check-error-${capability.capability_id}`}>
                                Preflight tạm thời không khả dụng; không thay đổi dữ liệu nào.
                              </span>
                            ) : capabilityCheck ? (
                              <>
                                <span className="text-muted-foreground" data-testid={`capability-check-${capability.capability_id}`}>
                                  Kết quả: {capabilityCheck.check}
                                </span>
                                {safeAlternatives.length ? (
                                  <span className="text-muted-foreground" data-testid={`capability-safe-alternatives-${capability.capability_id}`}>
                                    Safe alternatives: {safeAlternatives.join(', ')}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-muted-foreground" data-testid={`capability-check-pending-${capability.capability_id}`}>
                                Mở chi tiết để chạy preflight read-only.
                              </span>
                            )}
                          </div>
                        ) : null}
                        {isPlanned ? (
                          <p className="rounded bg-amber-50 px-2 py-1 text-amber-800" data-testid={`capability-planned-note-${capability.capability_id}`}>
                            Planned — capability đã khai báo nhưng chưa có renderer/evidence. Chọn &quot;Use in
                            conversation&quot; bị vô hiệu hoá; Agent sẽ trả lời trạng thái planned mà không tự động build/run.
                          </p>
                        ) : null}
                        {!selectable && !isPlanned ? (
                          <p className="rounded bg-slate-50 px-2 py-1 text-slate-600" data-testid={`capability-unsupported-note-${capability.capability_id}`}>
                            Không thể chọn trực tiếp: {capability.support_state} · {capability.status}. Hãy chọn mục stable
                            khác hoặc hỏi Agent về các lựa chọn thay thế.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Selection handoff — AC-005, never calls Definition/Build/Run */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[length:calc(11px*var(--font-scale))] text-muted-foreground">
                      {selectable ? 'Sẵn sàng để tạo scenario' : isPlanned ? 'Planned — không khả dụng để chạy' : 'Không khả dụng'}
                    </span>
                    <button
                      type="button"
                      disabled={!selectable}
                      data-testid={`capability-use-${capability.capability_id}`}
                      title={
                        selectable
                          ? 'Đưa lựa chọn này vào khung Agent'
                          : `Không thể chọn: ${capability.status} / ${capability.support_state} (${capability.evidence_level})`
                      }
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => {
                        if (!selectable) return;
                        onSelect({
                          capabilityId: capability.capability_id,
                          displayName: capability.display_name,
                          kind: capability.kind,
                        });
                      }}
                    >
                      Use in conversation
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
