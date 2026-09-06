import { useState, type KeyboardEventHandler, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Layers, LayoutGrid, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Settings, SlidersHorizontal, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/shared/components/BrandMark';
import { AccountMenu } from './AccountMenu';
import { useT } from '@/shared/i18n';

/** Shape the sidebar renders. Durable agent conversations are projected onto
 * this by ForgeWorkspace so the presentation stays identical to the approved design. */
export type SidebarScenario = {
  id: string;
  title: string;
  state: 'working' | 'passed' | 'failed' | 'draft';
  meta: string;
};

const navItems = [
  { id: 'workspace', labelKey: 'nav.workspace', icon: LayoutGrid },
  { id: 'library', labelKey: 'nav.library', icon: Layers },
  { id: 'runs', labelKey: 'nav.runs', icon: Play },
  { id: 'templates', labelKey: 'nav.templates', icon: SlidersHorizontal },
] as const;

const stateTone = {
  working: 'bg-primary',
  passed: 'bg-success-foreground',
  failed: 'bg-destructive',
  draft: 'bg-muted-foreground/50',
} as const;

type Props = {
  concealed?: boolean;
  open: boolean;
  active: string;
  selectedScenario: string;
  onToggle: () => void;
  onSelect: (id: string, label: string) => void;
  onNewScenario: () => void;
  onSelectScenario: (id: string, title: string, meta: string) => void;
  onRenameScenario?: (id: string, title: string) => void | Promise<void>;
  modal: boolean;
  sidebarRef: RefObject<HTMLElement>;
  onSidebarKeyDown: KeyboardEventHandler<HTMLElement>;
  /** Live durable conversations. */
  scenarios?: readonly SidebarScenario[];
  onOpenSettings: () => void;
};

export function ForgeSidebar({ concealed = false, open, active, selectedScenario, onToggle, onSelect, onNewScenario, onSelectScenario, onRenameScenario, modal, sidebarRef, onSidebarKeyDown, scenarios, onOpenSettings }: Props) {
  const t = useT();
  // No fixture fallback: an empty Recent list is the truth about a project
  // with no conversations, and inventing two makes the sidebar unreadable.
  const items = scenarios ?? [];
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const commitRename = (item: SidebarScenario) => {
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!next || next === item.title || !onRenameScenario) return;
    void Promise.resolve(onRenameScenario(item.id, next));
  };
  return (
    <aside
      style={{ width: open ? 264 : 68 }}
      data-open={open}
      ref={sidebarRef}
      onKeyDown={onSidebarKeyDown}
      role={modal ? 'dialog' : undefined}
      aria-modal={modal || undefined}
      aria-hidden={concealed || undefined}
      inert={(concealed ? '' : undefined) as unknown as boolean}
      className={cn('forge-sidebar relative z-30 flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar', concealed && 'hidden')}
      aria-label={t('sidebar.navigation')}
    >
      <div className="flex h-14 shrink-0 items-center px-3">
        {open ? (
          /* Expanded: the brand is the way back to a blank scenario, the way a
             chat product's logo starts a new conversation. Collapsing is its own
             control beside it, so the two intents never share a click target. */
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              data-testid="sidebar-new-scenario"
              onClick={onNewScenario}
              aria-label={t('sidebar.brandNewScenario')}
              className="group flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-sidebar-foreground transition-colors hover:bg-surface"
            >
              <BrandMark testId="sidebar-brand-mark" className="size-8 shrink-0 object-contain" />
              <span className="min-w-0 flex-1 truncate text-left text-[length:calc(15px*var(--font-scale))] font-semibold tracking-tight">Scenario Forge</span>
            </button>
            <button
              type="button"
              data-testid="sidebar-toggle"
              data-open={open}
              onClick={onToggle}
              aria-label={t('sidebar.collapse')}
              aria-expanded={open}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <PanelLeftClose aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : (
          /* Collapsed: the rail is too narrow to hold two intents, and the mark
             already reads as "expand" on hover, so it keeps that single job. */
          <button
            type="button"
            data-testid="sidebar-toggle"
            data-open={open}
            onClick={onToggle}
            aria-label={t('sidebar.expand')}
            aria-expanded={open}
            className="sidebar-brand-toggle group relative mx-auto flex min-h-11 w-11 items-center justify-center rounded-lg text-sidebar-foreground"
          >
            <span className="relative grid size-8 shrink-0 place-items-center">
              <BrandMark testId="sidebar-brand-mark" className="sidebar-brand-mark size-8 object-contain" />
              <span data-testid="sidebar-expand-icon" className="sidebar-expand-icon absolute inset-0 grid place-items-center text-muted-foreground"><PanelLeftOpen aria-hidden="true" className="size-4" /></span>
            </span>
            <span className="sr-only">Scenario Forge</span>
          </button>
        )}
      </div>

      <div className="px-3">
        <button type="button" onClick={onNewScenario} aria-label={t('sidebar.newScenario')} className={cn('flex min-h-11 w-full items-center gap-2 rounded-lg bg-primary py-2.5 text-[length:calc(13px*var(--font-scale))] font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98]', open ? 'px-3' : 'justify-center px-0')}>
          <Plus aria-hidden="true" className="size-4 shrink-0" />
          {open ? <span className="truncate">{t('sidebar.newScenario')}</span> : null}
        </button>
      </div>

      <nav aria-label={t('sidebar.sections')} className="mt-5 flex flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelect(item.id, t(item.labelKey))}
              title={t(item.labelKey)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey)}
              className={cn('relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-[length:calc(13px*var(--font-scale))] transition-colors duration-200', isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground', !open && 'justify-center px-0')}
            >
              {isActive ? <motion.span layoutId="nav-active" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 rounded-lg bg-sidebar-accent" /> : null}
              <item.icon aria-hidden="true" className="relative size-4 shrink-0" />
              {open ? <span className="relative truncate">{t(item.labelKey)}</span> : null}
            </button>
          );
        })}
      </nav>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="scroll-pane scroll-slim mt-6 min-h-0 flex-1 overflow-y-auto px-3">
            <div className="label-caps mb-2 px-1">{t('sidebar.recent')}</div>
            <div className="flex flex-col gap-0.5">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.04 * index }}
                  className={cn('group flex min-h-11 w-full items-center rounded-lg transition-colors duration-200 hover:bg-sidebar-accent/60', selectedScenario === item.id && 'bg-sidebar-accent/70')}
                >
                  {renamingId === item.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5"
                      onSubmit={(event) => { event.preventDefault(); commitRename(item); }}
                    >
                      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', stateTone[item.state])} />
                      <input
                        autoFocus
                        maxLength={200}
                        aria-label={t('sidebar.threadName')}
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => setRenamingId(null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setRenamingId(null);
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitRename(item);
                          }
                        }}
                        className="min-h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[length:calc(12.5px*var(--font-scale))] font-medium outline-none focus:ring-2 focus:ring-ring/30"
                      />
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectScenario(item.id, item.title, item.meta)}
                        aria-pressed={selectedScenario === item.id}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                      >
                        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', stateTone[item.state], item.state === 'working' && 'dot-pulse')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[length:calc(12.5px*var(--font-scale))] font-medium">{item.title}</span>
                          <span className="block truncate text-[length:calc(11px*var(--font-scale))] text-muted-foreground">{item.meta}</span>
                        </span>
                      </button>
                      {onRenameScenario ? (
                        <button
                          type="button"
                          aria-label={t('sidebar.rename', { title: item.title })}
                          title={t('sidebar.renameHint')}
                          onClick={() => { setRenameDraft(item.title); setRenamingId(item.id); }}
                          className="mr-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-sidebar-accent hover:text-sidebar-foreground focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/30 group-hover:opacity-100"
                        >
                          <Pencil aria-hidden="true" className="size-3.5" />
                        </button>
                      ) : null}
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-auto border-t border-sidebar-border p-2">
        <AccountMenu open={open} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}
