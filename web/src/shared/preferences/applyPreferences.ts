import type { Density, FontScale, MotionChoice, ThemeChoice, UserPreferences } from './types';

export const THEME_STORAGE_KEY = 'sf_preferences';
export const LEGACY_SEED_KEY = 'sf_default_seed';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** `system` is resolved to a concrete value here rather than in CSS. A media
 *  query would need every token duplicated inside `@media`, and the resolved
 *  attribute is also what tests and the pre-paint script can assert on.
 */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

export function resolveMotion(choice: MotionChoice, prefersReduce: boolean): 'reduce' | 'full' {
  if (choice === 'system') return prefersReduce ? 'reduce' : 'full';
  return choice;
}

export function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function applyPreferences(preferences: UserPreferences, root: HTMLElement = document.documentElement) {
  const { theme, density, fontScale, motion } = preferences.appearance;
  const resolvedTheme = resolveTheme(theme, matches(DARK_QUERY));
  root.dataset.theme = resolvedTheme;
  root.dataset.themeChoice = theme;
  root.dataset.density = density;
  root.dataset.motion = resolveMotion(motion, matches(REDUCE_QUERY));
  root.dataset.fontScale = fontScale;
  root.style.colorScheme = resolvedTheme;
  root.lang = preferences.locale.language;
}

/** The scales themselves live in `globals.css`, keyed off `data-font-scale` and
 *  `data-density`, so the pre-paint script only has to stamp two attributes and
 *  never has to agree with the stylesheet about a number.
 */
export const FONT_SCALE_CHOICES: FontScale[] = ['sm', 'md', 'lg'];
export const DENSITY_CHOICES: Density[] = ['comfortable', 'compact'];

/** Subscribes to the two OS-level media queries so `system` keeps tracking the
 *  OS after first paint instead of freezing at the value it had on load.
 */
export function watchSystemPreferences(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const media = [window.matchMedia(DARK_QUERY), window.matchMedia(REDUCE_QUERY)];
  for (const item of media) item.addEventListener('change', onChange);
  return () => { for (const item of media) item.removeEventListener('change', onChange); };
}

export function readStoredPreferences(): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeStoredPreferences(preferences: UserPreferences) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Private mode and disabled site data both throw; preferences stay in memory. */
  }
}

/** The seed used to live under its own key, written straight from the old
 *  settings dialog. Read it once so an existing user's seed survives the move.
 */
export function readLegacySeed(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const seed = window.localStorage.getItem(LEGACY_SEED_KEY);
    return seed && /^\d+$/.test(seed) ? seed : null;
  } catch {
    return null;
  }
}
