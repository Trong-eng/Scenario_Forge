'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { useAuth } from '@/shared/auth/AuthContext';
import { settingsApi } from '@/shared/api/settings';
import {
  applyPreferences, readLegacySeed, readStoredPreferences, watchSystemPreferences, writeStoredPreferences,
} from './applyPreferences';
import {
  DEFAULT_PREFERENCES, coercePreferences, mergePreferences,
  type PreferenceGroup, type UserPreferences, type UserPreferencesPatch,
} from './types';

/** `local` means the server never answered, so the choices live only in this
 *  browser. The UI says so rather than implying the account was updated.
 */
export type SyncState = 'loading' | 'synced' | 'saving' | 'local' | 'error';

type PreferencesContextValue = {
  preferences: UserPreferences;
  sync: SyncState;
  error: string | null;
  update: <K extends PreferenceGroup>(group: K, patch: Partial<UserPreferences[K]>) => void;
  reset: () => void;
  retry: () => void;
};

const noop = () => undefined;

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES, sync: 'local', error: null, update: noop, reset: noop, retry: noop,
});

/** Reads storage during the first render so the tree never paints defaults and
 *  then swaps — the same reason `themeScript` runs before paint.
 */
function initialPreferences(): UserPreferences {
  const stored = readStoredPreferences();
  const base = coercePreferences(stored ?? {});
  if (stored) return base;
  const legacySeed = readLegacySeed();
  return legacySeed ? mergePreferences(base, { run: { defaultSeed: legacySeed } }) : base;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [sync, setSync] = useState<SyncState>('loading');
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const pending = useRef<UserPreferencesPatch>({});
  const timer = useRef<number | null>(null);
  const lastGood = useRef<UserPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const local = initialPreferences();
    lastGood.current = local;
    setPreferences(local);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    applyPreferences(preferences);
    writeStoredPreferences(preferences);
  }, [preferences]);

  useEffect(() => watchSystemPreferences(() => applyPreferences(preferences)), [preferences]);

  const load = useCallback(async () => {
    setSync('loading');
    try {
      const body = await settingsApi.getPreferences();
      lastGood.current = body.preferences;
      setPreferences(body.preferences);
      setSync('synced');
      setError(null);
    } catch {
      // A missing endpoint is the expected state against the real backend, so
      // this is a downgrade to local-only rather than a failure to report.
      setSync('local');
    }
  }, []);

  // The landing page is public and must stay silent: an anonymous visitor
  // makes no API calls at all, which `e2e/landing.spec.ts` asserts. Preferences
  // are per-account, so there is nothing to ask the server for until there is
  // an account to ask about.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { setSync('local'); return; }
    void load();
  }, [authLoading, isAuthenticated, load]);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    setSync('saving');
    try {
      const body = await settingsApi.patchPreferences(patch);
      lastGood.current = body.preferences;
      setPreferences(body.preferences);
      setSync('synced');
      setError(null);
    } catch (cause) {
      setPreferences(lastGood.current);
      setSync('error');
      setError(cause instanceof Error ? cause.message : 'Không lưu được thay đổi.');
    }
  }, []);

  const update = useCallback<PreferencesContextValue['update']>((group, patch) => {
    setPreferences((current) => {
      const next = mergePreferences(current, { [group]: patch } as UserPreferencesPatch);
      pending.current = { ...pending.current, [group]: { ...(pending.current[group] ?? {}), ...patch } };
      return next;
    });
    if (sync === 'local') return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 400);
  }, [flush, sync]);

  const reset = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    pending.current = { ...DEFAULT_PREFERENCES };
    if (sync !== 'local') { if (timer.current) window.clearTimeout(timer.current); void flush(); }
  }, [flush, sync]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({ preferences, sync, error, update, reset, retry: () => void load() }),
    [error, load, preferences, reset, sync, update],
  );

  // CSS can flatten CSS animations but not the JS-driven ones from `motion`,
  // so the choice is handed to the library as well.
  const reduced = preferences.appearance.motion === 'reduce';

  return (
    <PreferencesContext.Provider value={value}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>
    </PreferencesContext.Provider>
  );
}

/** Falls back to defaults outside a provider, matching `useAuth`'s guest
 *  fallback (`AuthContext.tsx:220`) so a stray component renders instead of
 *  crashing the tree.
 */
export function usePreferences() {
  return useContext(PreferencesContext);
}
