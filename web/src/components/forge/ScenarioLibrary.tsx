'use client';

import { useMemo, useState } from 'react';
import type { ProviderDefinition, ProviderRegistryItem } from '@/shared/api/schemas';
import { StatusBadge } from './LiveDataViews';
import { SelectField } from './SelectField';
import { orderSemanticLineage } from './lineage';
import { RegistryComparisonPanel } from './RegistryComparisonPanel';
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
  definitions: ProviderDefinition[];
  registry: ProviderRegistryItem[];
  onSelect: (id: string) => void;
  onReplay: (item: ProviderRegistryItem) => Promise<string | null>;
  onCompare: (left: string, right: string) => Promise<RegistryComparisonResult | null>;
};

export function ScenarioLibrary({ definitions, registry, onSelect, onReplay, onCompare }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'built' | 'run'>('all');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<RegistryComparisonResult | null>(null);
  const rows = useMemo(() => definitions.map((definition) => {
    const lineage = orderSemanticLineage(registry.filter((item) => item.definition_id === definition.definition.definition_id));
    const latest = lineage[0];
    const derivedStatus = latest?.run_id ? 'run' : latest ? 'built' : 'draft';
    return { definition, lineage, latest, derivedStatus };
  }).filter((row) => {
    const matchesQuery = `${row.definition.definition.description} ${row.definition.definition.definition_id}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchesQuery && (status === 'all' || row.derivedStatus === status);
  }), [definitions, query, registry, status]);

  const replay = async (item: ProviderRegistryItem) => {
    const action = `replay:${item.build_id}`;
    setPendingAction(action);
    setActionError(null);
    try {
      await onReplay(item);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('library.replayFailed'));
    } finally {
      setPendingAction(null);
    }
  };

  const compare = async (leftBuildId: string, rightBuildId: string) => {
    const action = `compare:${leftBuildId}:${rightBuildId}`;
    setPendingAction(action);
    setActionError(null);
    try {
      const result = await onCompare(leftBuildId, rightBuildId);
      if (result) setComparison(result);
      else setActionError(t('library.compareUnavailable'));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('library.compareFailed'));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section className={secondaryPageClass}>
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('library.title')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage Definitions and immutable provider lineage from one project inventory.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect('')}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {t('library.newScenario')}
          </button>
        </header>

        <div className="grid grid-cols-[12rem_minmax(0,1fr)] items-start gap-3 max-md:grid-cols-1">
          <aside aria-label={t('library.filters')} className={`${secondaryPanelClass} p-4`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('library.filtersTitle')}</h2>
              <button
                type="button"
                onClick={() => { setQuery(''); setStatus('all'); }}
                className="min-h-9 rounded-md px-2 text-xs font-semibold text-primary transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
              >
                Clear all
              </button>
            </div>
            <label className="block text-xs font-semibold text-muted-foreground">
              Search
              <input
                type="search"
                role="searchbox"
                aria-label={t('library.search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('library.searchPlaceholder')}
                className={`${secondaryControlClass} mt-2 w-full`}
              />
            </label>
            <label className="mt-5 block text-xs font-semibold text-muted-foreground">
              Status
              <div className="mt-2">
                <SelectField
                  aria-label={t('library.filterByStatus')}
                  value={status}
                  onChange={(next) => setStatus(next as typeof status)}
                  options={[
                    { value: 'all', label: 'All statuses' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'built', label: 'Built' },
                    { value: 'run', label: 'Run recorded' },
                  ]}
                />
              </div>
            </label>
            <div className="mt-8 rounded-xl bg-accent p-3">
              <p className="text-xs font-semibold">Current view</p>
              <p className="mt-1 text-xs text-muted-foreground">{rows.length} of {definitions.length} Definitions</p>
            </div>
          </aside>

          <div className={`${secondaryPanelClass} overflow-hidden`}>
            <div className={secondaryToolbarClass}>
              <strong className="text-sm">{rows.length} scenario{rows.length === 1 ? '' : 's'}</strong>
              <span className="ml-auto text-xs text-muted-foreground">Highest semantic version first</span>
            </div>
            <div className="overflow-x-auto">
              <div role="table" aria-label={t('library.inventory')} className="min-w-[48rem]">
                <div role="row" className={`grid grid-cols-[minmax(16rem,2fr)_6rem_9rem_7rem_8rem] gap-3 ${inventoryHeaderClass}`}>
                  <span role="columnheader">{t('library.colScenario')}</span>
                  <span role="columnheader">{t('library.colVersion')}</span>
                  <span role="columnheader">{t('library.colLineage')}</span>
                  <span role="columnheader">{t('library.colStatus')}</span>
                  <span role="columnheader">{t('library.colActions')}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t('library.empty')}</p>
                ) : rows.map(({ definition, lineage, latest, derivedStatus }) => (
                  <div
                    role="row"
                    key={definition.definition.definition_id}
                    className={`grid min-h-20 grid-cols-[minmax(16rem,2fr)_6rem_9rem_7rem_8rem] items-center gap-3 ${inventoryRowClass}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(definition.definition.definition_id)}
                      className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                    >
                      <strong className="block truncate text-sm">{definition.definition.description}</strong>
                      <small className="block truncate font-mono text-[0.6875rem] text-muted-foreground">{definition.definition.definition_id}</small>
                    </button>
                    <span className="tabular-nums">v{definition.definition.version}</span>
                    <span className="truncate font-mono text-xs">{latest?.build_id ?? '—'}</span>
                    <StatusBadge value={latest?.run_status ?? derivedStatus} />
                    <span className="flex gap-1">
                      {latest && latest.run_seed !== null ? (
                        <button
                          type="button"
                          aria-label={`Replay ${latest.build_id}`}
                          onClick={() => void replay(latest)}
                          disabled={pendingAction === `replay:${latest.build_id}`}
                          className={secondaryActionClass}
                        >
                          {pendingAction === `replay:${latest.build_id}` ? 'Replaying…' : 'Replay'}
                        </button>
                      ) : null}
                      {lineage.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Compare builds for ${definition.definition.definition_id}`}
                          onClick={() => void compare(lineage[1].build_id, lineage[0].build_id)}
                          disabled={pendingAction === `compare:${lineage[1].build_id}:${lineage[0].build_id}`}
                          className={secondaryActionClass}
                        >
                          {pendingAction === `compare:${lineage[1].build_id}:${lineage[0].build_id}` ? 'Comparing…' : 'Compare'}
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {actionError ? (
          <p role="alert" className="mt-3 rounded-lg border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
        {comparison ? <RegistryComparisonPanel comparison={comparison} onClose={() => setComparison(null)} /> : null}
      </div>
    </section>
  );
}
