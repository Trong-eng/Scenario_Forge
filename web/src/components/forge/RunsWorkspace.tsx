'use client';

import { useMemo, useState } from 'react';
import type { ProviderEvaluation, ProviderRegistryItem, ProviderRunView, RegistryArtifactOutcome } from '@/shared/api/schemas';
import { RunEvidence, StatusBadge } from './LiveDataViews';
import { RegistryComparisonPanel } from './RegistryComparisonPanel';
import { SelectField } from './SelectField';
import type { RegistryComparisonResult } from './useLiveWorkspace';
import {
  inventoryHeaderClass,
  inventoryRowClass,
  secondaryActionClass,
  secondaryControlClass,
  secondaryPageClass,
  secondaryPanelClass,
  secondaryToolbarClass,
} from './secondarySurfaceStyles';

import { useT } from '@/shared/i18n';
type Props = {
  registry: ProviderRegistryItem[];
  run: ProviderRunView | null;
  evaluation: ProviderEvaluation | null;
  artifactOutcomes: RegistryArtifactOutcome[];
  onSelect: (runId: string) => Promise<boolean>;
  onCancel: () => void;
  onCompare: (leftBuildId: string, rightBuildId: string) => Promise<RegistryComparisonResult | null>;
};

function failureMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function RunsWorkspace({ registry, run, evaluation, artifactOutcomes, onSelect, onCancel, onCompare }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<RegistryComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const runs = useMemo(() => registry.filter((item) => item.run_id).filter((item) => {
    const matchesQuery = `${item.run_id} ${item.build_id} ${item.definition_id}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (status === 'all' || item.run_status === status);
  }), [query, registry, status]);
  const statuses = [...new Set(registry.map((item) => item.run_status).filter((item): item is string => Boolean(item)))];
  const selectedRows = selected.map((id) => runs.find((item) => item.run_id === id)).filter((item): item is ProviderRegistryItem => Boolean(item));
  const terminal = run ? ['succeeded', 'failed', 'cancelled'].includes(run.status.toLowerCase()) : true;
  const showsEvidence = Boolean(run || pendingRunId || openingError || comparison);

  const toggle = (runId: string) => setSelected((current) => current.includes(runId) ? current.filter((item) => item !== runId) : [...current.slice(-1), runId]);

  const openRun = async (runId: string) => {
    if (pendingRunId) return;
    setPendingRunId(runId);
    setOpeningError(null);
    try {
      const opened = await onSelect(runId);
      if (!opened) setOpeningError(t('runs.evidenceFailed'));
    } catch (error) {
      setOpeningError(failureMessage(error, t('runs.evidenceFailed')));
    } finally {
      setPendingRunId(null);
    }
  };

  const compareSelected = async () => {
    if (selectedRows.length !== 2 || isComparing) return;
    setIsComparing(true);
    setOpeningError(null);
    try {
      const result = await onCompare(selectedRows[0].build_id, selectedRows[1].build_id);
      if (!result) throw new Error(t('runs.compareUnavailable'));
      setComparison(result);
    } catch (error) {
      setOpeningError(failureMessage(error, t('runs.compareUnavailable')));
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <section className={secondaryPageClass}>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('runs.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('runs.subtitle')}</p>
        </div>

        <div className={secondaryPanelClass}>
          <div className={secondaryToolbarClass}>
            <div className="w-52">
              <SelectField
                aria-label={t('runs.filterByStatus')}
                prefix={t('runs.statusPrefix')}
                value={status}
                onChange={setStatus}
                options={[{ value: 'all', label: t('runs.all') }, ...statuses.map((item) => ({ value: item, label: item }))]}
              />
            </div>
            <input type="search" role="searchbox" aria-label={t('runs.search')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('runs.searchPlaceholder')} className={`${secondaryControlClass} ml-auto min-w-64 max-sm:min-w-0 max-sm:flex-1`} />
            <button disabled={selectedRows.length !== 2 || isComparing} onClick={() => void compareSelected()} className={`${secondaryActionClass} min-h-11 px-4`}>
              {isComparing ? t('runs.comparing') : t('runs.compareSelected')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <div role="table" aria-label={t('runs.table')} className="min-w-[64rem]">
              <div role="row" className={`grid grid-cols-[2rem_1.1fr_1fr_5rem_7rem_7rem_7rem_5rem] gap-3 ${inventoryHeaderClass}`}>
                <span />
                <span role="columnheader">{t('runs.colRun')}</span>
                <span role="columnheader">{t('runs.colBuild')}</span>
                <span role="columnheader">{t('runs.colSeed')}</span>
                <span role="columnheader">{t('runs.colStatus')}</span>
                <span role="columnheader">{t('runs.colResult')}</span>
                <span role="columnheader">{t('runs.colArtifacts')}</span>
                <span role="columnheader">{t('runs.open')}</span>
              </div>
              {runs.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{t('runs.empty')}</p> : runs.map((item) => {
                const published = Object.values(item.artifact_states).filter((value) => value === 'published').length;
                const unavailable = item.artifact_ids.length - published;
                const isOpening = pendingRunId === item.run_id;
                return (
                  <div role="row" key={item.run_id} className={`grid min-h-16 grid-cols-[2rem_1.1fr_1fr_5rem_7rem_7rem_7rem_5rem] items-center gap-3 ${inventoryRowClass} ${run?.run.run_id === item.run_id ? 'bg-accent/70' : ''}`}>
                    <input type="checkbox" aria-label={`Select run ${item.run_id}`} checked={Boolean(item.run_id && selected.includes(item.run_id))} onChange={() => item.run_id && toggle(item.run_id)} />
                    <button onClick={() => item.run_id && void openRun(item.run_id)} disabled={Boolean(pendingRunId)} className="truncate rounded-md text-left font-mono text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-45">{item.run_id}</button>
                    <span className="truncate font-mono text-xs">{item.build_id}</span>
                    <span className="tabular-nums">{item.run_seed ?? '—'}</span>
                    <StatusBadge value={item.run_status} />
                    <StatusBadge value={item.evaluation_outcome ?? 'pending'} />
                    <span className="text-xs tabular-nums">{published} published · {unavailable} unavailable</span>
                    <button onClick={() => item.run_id && void openRun(item.run_id)} disabled={Boolean(pendingRunId)} aria-label={`Open run ${item.run_id}`} className={`${secondaryActionClass} border-primary text-primary`}>
                      {isOpening ? 'Opening…' : 'Open'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {openingError ? <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{openingError}</p> : null}
        {comparison ? <RegistryComparisonPanel comparison={comparison} onClose={() => setComparison(null)} /> : null}
        {showsEvidence ? (
          <article aria-label="Selected run evidence" className={`${secondaryPanelClass} mt-3 p-4`}>
            {pendingRunId ? <div className="grid min-h-48 place-items-center text-center"><div><p className="text-sm font-semibold">Opening Run</p><p className="mt-1 text-xs text-muted-foreground">Loading provider evidence for {pendingRunId}…</p></div></div> : null}
            {!pendingRunId && run ? <><div className="mb-4 flex items-center"><h2 className="text-sm font-semibold">Run detail</h2><button disabled={terminal} onClick={onCancel} className="ml-auto min-h-10 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive disabled:opacity-45">Cancel run</button></div><RunEvidence run={run} evaluation={evaluation} artifacts={artifactOutcomes} /></> : null}
            {!pendingRunId && !run && openingError ? <div className="grid min-h-48 place-items-center text-center"><div><p className="text-sm font-semibold">Run unavailable</p><p className="mt-1 text-xs text-muted-foreground">Choose Open again after refreshing the project data.</p></div></div> : null}
          </article>
        ) : runs.length > 0 ? <p className="mt-3 text-sm text-muted-foreground">Choose Open on a Run to inspect its provider evidence.</p> : null}
      </div>
    </section>
  );
}
