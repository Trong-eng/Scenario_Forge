'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2, Search, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleFormat } from '@/shared/i18n';
import { usePreferences } from '@/shared/preferences/PreferencesContext';
import { ModalOverlay } from '../ModalOverlay';
import type { LiveSession } from '../liveTypes';
import { AboutSection } from './AboutSection';
import { AccountSection } from './AccountSection';
import { AppearanceSection } from './AppearanceSection';
import { DataSection } from './DataSection';
import { LocaleSection } from './LocaleSection';
import { NotificationsSection } from './NotificationsSection';
import { RunDefaultsSection } from './RunDefaultsSection';
import { SecuritySection } from './SecuritySection';
import { ShortcutsSection } from './ShortcutsSection';
import { Notice } from './primitives';
import { SECTIONS, SECTION_GROUPS, foldText, isSectionId, type SectionId } from './sections';

export const SETTINGS_QUERY_KEY = 'settings';

type Props = {
  session: LiveSession | null;
  permissions: string[];
  initialSection?: SectionId;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
};

/** Settings shows what the running system can honour, and says plainly when it
 *  cannot honour something.
 *
 *  The rule the previous version set — never render a control that quietly does
 *  nothing — still holds. What changed is the answer to it: the theme, locale,
 *  notification and run preferences are now backed by a real preference store
 *  rather than listed as unavailable, and the one genuinely impossible action
 *  (deleting an account) is the only disabled control on the screen.
 */
export function SettingsDialog({ session, permissions, initialSection, returnFocusRef, onClose }: Props) {
  const { t } = useLocaleFormat();
  const { sync, error, retry } = usePreferences();
  const dialogRef = useRef<HTMLElement>(null);
  const [section, setSection] = useState<SectionId>(initialSection ?? 'account');
  const [query, setQuery] = useState('');

  // Deep link so a shortcut, a bug report or a bookmark can point at one
  // section. replaceState keeps Back meaning "the page before Settings".
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set(SETTINGS_QUERY_KEY, section);
    window.history.replaceState(window.history.state, '', url);
    return () => {
      const cleanup = new URL(window.location.href);
      cleanup.searchParams.delete(SETTINGS_QUERY_KEY);
      window.history.replaceState(window.history.state, '', cleanup);
    };
  }, [section]);

  const matches = useMemo(() => {
    const needle = foldText(query);
    if (!needle) return SECTIONS;
    return SECTIONS.filter((spec) => {
      const haystack = [spec.labelKey, ...spec.terms].map((key) => foldText(t(key)));
      return haystack.some((value) => value.includes(needle));
    });
  }, [query, t]);

  // A search that hides the open section would otherwise leave the panel
  // showing something the rail no longer offers.
  useEffect(() => {
    if (matches.length && !matches.some((spec) => spec.id === section)) setSection(matches[0].id);
  }, [matches, section]);

  const renderSection = useCallback(() => {
    switch (section) {
      case 'account': return <AccountSection session={session} permissions={permissions} />;
      case 'appearance': return <AppearanceSection />;
      case 'locale': return <LocaleSection />;
      case 'notifications': return <NotificationsSection />;
      case 'run': return <RunDefaultsSection />;
      case 'security': return <SecuritySection />;
      case 'shortcuts': return <ShortcutsSection />;
      case 'data': return <DataSection />;
      case 'about': return <AboutSection />;
    }
  }, [permissions, section, session]);

  const activeLabel = t(SECTIONS.find((spec) => spec.id === section)?.labelKey ?? 'settings.title');

  return (
    <ModalOverlay name="settings" backdropTestId="settings-backdrop" dialogRef={dialogRef} onClose={onClose} restoreFocusRef={returnFocusRef}>
      {(onKeyDown) => (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            ref={dialogRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            data-testid="settings-dialog"
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex h-[min(40rem,88vh)] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-float max-sm:flex-col"
          >
            <nav aria-label={t('settings.nav')} className="flex w-60 shrink-0 flex-col border-r border-border/70 bg-surface/40 max-sm:w-full max-sm:border-r-0 max-sm:border-b">
              <div className="p-3 pb-2">
                <h2 id="settings-title" className="px-1 pb-2.5 text-[length:calc(13px*var(--font-scale))] font-semibold">{t('settings.title')}</h2>
                <span className="relative flex">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label={t('settings.search')}
                    placeholder={t('settings.search')}
                    className="min-h-9 w-full rounded-lg border border-input bg-card pl-8 pr-2 text-[length:calc(12px*var(--font-scale))] outline-none focus:ring-2 focus:ring-ring/25"
                  />
                </span>
              </div>
              <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-2 pb-3 max-sm:max-h-40">
                {SECTION_GROUPS.map((group) => {
                  const items = matches.filter((spec) => spec.group === group.id);
                  if (!items.length) return null;
                  return (
                    <div key={group.id} className="mb-2 last:mb-0">
                      <p className="label-caps px-2.5 pb-1 pt-2">{t(group.labelKey)}</p>
                      {items.map(({ id, labelKey, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSection(id)}
                          aria-current={section === id}
                          className={cn(
                            'flex min-h-10 w-full shrink-0 items-center gap-2 rounded-lg px-2.5 text-left text-[length:calc(12.5px*var(--font-scale))] transition-colors',
                            section === id ? 'bg-surface font-medium text-foreground' : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground',
                          )}
                        >
                          <Icon aria-hidden="true" className="size-3.5 shrink-0" />{t(labelKey)}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {!matches.length ? (
                  <p role="status" className="px-2.5 py-3 text-[length:calc(12px*var(--font-scale))] leading-relaxed text-muted-foreground">
                    {t('settings.searchEmpty', { q: query })}
                  </p>
                ) : null}
              </div>
            </nav>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/70 px-4">
                <h3 className="truncate text-[length:calc(13.5px*var(--font-scale))] font-semibold">{activeLabel}</h3>
                <span className="flex shrink-0 items-center gap-2">
                  <span aria-live="polite" className="flex items-center gap-1.5 text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">
                    {sync === 'saving' ? <><Loader2 aria-hidden="true" className="size-3 animate-spin" />{t('settings.saving')}</> : null}
                    {sync === 'synced' ? <><Check aria-hidden="true" className="size-3" />{t('settings.saved')}</> : null}
                    {sync === 'error' ? <><TriangleAlert aria-hidden="true" className="size-3 text-destructive" />{t('settings.saveFailed')}</> : null}
                  </span>
                  <button type="button" onClick={onClose} aria-label={t('settings.close')} className="icon-button"><X aria-hidden="true" className="size-4" /></button>
                </span>
              </div>

              <div className="scroll-slim scroll-pane min-h-0 flex-1 overflow-y-auto p-4">
                {sync === 'local' ? (
                  <div className="mb-4">
                    <Notice tone="info">
                      <strong className="font-semibold">{t('settings.localOnly')}.</strong> {t('settings.localOnlyHint')}
                    </Notice>
                  </div>
                ) : null}
                {sync === 'error' && error ? (
                  <div className="mb-4 flex items-center gap-3">
                    <Notice tone="error">{error}</Notice>
                    <button type="button" onClick={retry} className="control-button min-h-9 shrink-0">{t('settings.retry')}</button>
                  </div>
                ) : null}

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                    {renderSection()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </ModalOverlay>
  );
}

/** Reads the deep-link parameter without needing `useSearchParams`, which would
 *  force this subtree into a Suspense boundary in the App Router.
 */
export function readSettingsSectionFromUrl(): SectionId | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = new URL(window.location.href).searchParams.get(SETTINGS_QUERY_KEY);
  return isSectionId(value) ? value : undefined;
}
