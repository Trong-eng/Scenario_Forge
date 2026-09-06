import { motion } from 'motion/react';
import { GitCompare, PanelRightOpen } from 'lucide-react';
import { cn, getRovingTabIndex } from '@/lib/utils';
import type { DefinitionTab, FieldGroup } from './definitionModel';
import type { BuildGenerationMode } from './buildGenerationMode';
import { FieldRow, ProvenanceTag } from './primitives';

import { useT } from '@/shared/i18n';
function PanelEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center">
      <div className="max-w-xs space-y-1.5">
        <p className="text-[length:calc(13px*var(--font-scale))] font-semibold">{title}</p>
        <p className="text-[length:calc(12px*var(--font-scale))] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

const tabs = [
  { id: 'structured', labelKey: 'def.tabStructured' },
  { id: 'diff', labelKey: 'def.tabDiff' },
] as const;

type Props = {
  tab: DefinitionTab;
  availableTabs?: readonly DefinitionTab[];
  groups: FieldGroup[];
  inspectorOpen: boolean;
  /** False until a Definition exists; hides the control rather than offering an
   *  affordance that would open an empty panel. */
  inspectorAvailable?: boolean;
  onTabChange: (tab: DefinitionTab) => void;
  onFieldChange: (groupId: string, fieldId: string, value: string) => void;
  onCompare: () => void;
  onSubmit: () => void;
  /** Real count of locally-changed fields; 0 means nothing is pending. */
  pendingEdits: number;
  onOpenInspector: () => void;
  /** The first operational action belongs to the Structured workbench, not the chat transcript. */
  onGroundAndBuild?: () => void;
  /**
   * Where the flow goes once a Build already exists. Grounding again is not
   * offered there because it would produce the same Build from the same
   * Definition -- the edits above stay in this session until the provider can
   * publish IR values -- so the honest forward action is to open the step.
   */
  onOpenBuild?: () => void;
  buildSubmitting?: boolean;
  generationMode?: BuildGenerationMode;
  onGenerationModeChange?: (mode: BuildGenerationMode) => void;
};

export function DefinitionPanel({ tab, availableTabs = tabs.map((item) => item.id), groups, inspectorOpen, inspectorAvailable = true, onTabChange, onFieldChange, onCompare, onSubmit, onOpenInspector, pendingEdits, onGroundAndBuild, onOpenBuild, buildSubmitting = false, generationMode = 'baseline', onGenerationModeChange }: Props) {
  const t = useT();
  const visibleTabs = tabs.filter((item) => availableTabs.includes(item.id));
  const showViewControls = visibleTabs.length > 1 || (!inspectorOpen && inspectorAvailable);
  return (
    <section aria-label={t('def.title')} className="panel-surface flex h-full min-h-0 flex-col overflow-hidden">
      {showViewControls ? <div className="flex items-center gap-1 border-b border-border/70 px-3 py-2.5 max-sm:items-start">
        <div role="tablist" aria-label={t('def.views')} className="relative flex items-center gap-0.5 rounded-lg bg-surface p-0.5">
          {visibleTabs.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`definition-panel-${item.id}`}
              id={`definition-tab-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              key={item.id}
              onClick={() => onTabChange(item.id)}
              onKeyDown={(event) => {
                const nextIndex = getRovingTabIndex(event.key, visibleTabs.findIndex((candidate) => candidate.id === item.id), visibleTabs.length);
                if (nextIndex === null) return;
                event.preventDefault();
                const next = visibleTabs[nextIndex]!;
                onTabChange(next.id);
                document.getElementById(`definition-tab-${next.id}`)?.focus();
              }}
              className={cn('relative min-h-11 min-w-11 rounded-md px-3 py-1.5 text-[length:calc(12.5px*var(--font-scale))] font-medium transition-colors duration-200', tab === item.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {tab === item.id ? <motion.span layoutId="definition-tab" transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 rounded-md bg-card shadow-sm" /> : null}
              <span className="relative">{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {availableTabs.includes('diff') ? <button type="button" onClick={onCompare} aria-label={t('def.compareVersions')} className="control-button min-h-11 min-w-11 px-2.5"><GitCompare aria-hidden="true" className="size-3.5" /><span className="max-sm:hidden">{t('def.compare')}</span></button> : null}
          <button type="button" hidden={inspectorOpen || !inspectorAvailable} onClick={onOpenInspector} className="icon-button" aria-label={t('def.openInspector')}><PanelRightOpen aria-hidden="true" className="size-4" /></button>
        </div>
      </div> : null}

      <div data-testid="definition-scroll-region" className="scroll-pane scroll-slim min-h-0 flex-1 overflow-y-auto">
        <div role="tabpanel" id="definition-panel-structured" aria-label={showViewControls ? undefined : t('def.tabStructured')} aria-labelledby={showViewControls ? 'definition-tab-structured' : undefined} hidden={tab !== 'structured'}>
          {tab === 'structured' && groups.length === 0 ? (
            <div className="grid min-h-64 place-items-center px-6 text-center">
              <p className="max-w-[17rem] text-[length:calc(13px*var(--font-scale))] leading-relaxed text-muted-foreground">
                {t('def.empty')}
              </p>
            </div>
          ) : null}
          {tab === 'structured' && groups.length > 0 ? (
            <motion.div key="structured" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="space-y-6 px-3 py-4">
              {groups.map((group) => (
                <section key={group.id} aria-labelledby={`field-group-${group.id}`}>
                  <h2 id={`field-group-${group.id}`} className="label-caps mb-2 px-2">{group.title}</h2>
                  <div className="space-y-0.5">{group.fields.map((field) => <FieldRow key={field.id} field={field} onChange={(value) => onFieldChange(group.id, field.id, value)} />)}</div>
                </section>
              ))}
              <div className="rounded-xl border border-border/70 bg-surface/60 px-3.5 py-3">
                <div className="mb-2 flex items-center gap-1.5"><ProvenanceTag provenance="user" /><ProvenanceTag provenance="grounded" /><ProvenanceTag provenance="default" /></div>
                <p className="text-[length:calc(12.5px*var(--font-scale))] text-muted-foreground">{t('def.traceable')}</p>
              </div>
            </motion.div>
          ) : null}
        </div>
        <div role="tabpanel" id="definition-panel-diff" aria-labelledby="definition-tab-diff" hidden={tab !== 'diff'}>
          {tab === 'diff' ? (
            <motion.div key="diff" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="p-4">
              <PanelEmpty
                title={t('def.noDiffTitle')}
                detail={t('def.noDiffDetail')}
              />
            </motion.div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border/70 px-3 py-2.5">
        <span className="text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">{pendingEdits > 0 ? t('def.pendingEdits', { count: pendingEdits }) : t('def.noPendingEdits')}</span>
        {/* One live action at a time: edits are submitted first, and only a
            settled Definition offers the build. Submitting with nothing changed
            would report success over no work, so the control stays dim. */}
        <div className="ml-auto flex items-center gap-2">
          {onGroundAndBuild && onGenerationModeChange ? <label className="flex min-h-10 items-center gap-2 text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">
            <span>{t('def.buildMode')}</span>
            <select aria-label={t('def.buildModeLabel')} value={generationMode} disabled={buildSubmitting || pendingEdits > 0} onChange={(event) => onGenerationModeChange(event.target.value as BuildGenerationMode)} className="min-h-10 rounded-lg border border-input bg-card px-2 text-[length:calc(12px*var(--font-scale))] text-foreground disabled:cursor-not-allowed disabled:opacity-45">
              <option value="baseline">{t('def.baseline')}</option>
              <option value="rag">{t('def.ragLlm')}</option>
            </select>
          </label> : null}
          <button
            type="button"
            disabled={pendingEdits === 0}
            onClick={onSubmit}
            className={cn(
              'min-h-10 rounded-lg px-3.5 py-2 text-[length:calc(12px*var(--font-scale))] font-semibold transition-all',
              pendingEdits > 0
                ? 'bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]'
                : 'cursor-not-allowed border border-border bg-card text-muted-foreground opacity-45',
            )}
          >{t('def.submitEdit')}</button>
          {onGroundAndBuild || onOpenBuild ? <button
            type="button"
            disabled={buildSubmitting || pendingEdits > 0}
            title={pendingEdits > 0 ? t('def.submitFirst') : undefined}
            onClick={onGroundAndBuild ?? onOpenBuild}
            className={cn(
              'min-h-10 rounded-lg px-3.5 py-2 text-[length:calc(12px*var(--font-scale))] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45',
              pendingEdits > 0 ? 'border border-border bg-card' : 'bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]',
            )}
          >{buildSubmitting ? t('def.building') : onGroundAndBuild ? t('def.groundAndBuild') : t('def.goToBuild')}</button> : null}
        </div>
      </div>
    </section>
  );
}
