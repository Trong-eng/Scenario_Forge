import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES, coercePreferences, mergePreferences, UserPreferencesSchema,
} from '../../../src/shared/preferences/types';
import {
  applyPreferences, readLegacySeed, readStoredPreferences, resolveMotion, resolveTheme, writeStoredPreferences,
  LEGACY_SEED_KEY, THEME_STORAGE_KEY,
} from '../../../src/shared/preferences/applyPreferences';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-density');
});

describe('preference coercion', () => {
  it('keeps a group the stored document never had', () => {
    const coerced = coercePreferences({ appearance: { theme: 'dark' } });

    expect(coerced.appearance.theme).toBe('dark');
    // The rest of the appearance group and every other group fall back rather
    // than disappearing, which is what makes an older stored document usable.
    expect(coerced.appearance.density).toBe(DEFAULT_PREFERENCES.appearance.density);
    expect(coerced.notifications).toEqual(DEFAULT_PREFERENCES.notifications);
  });

  it('discards a group that cannot be repaired instead of the whole document', () => {
    const coerced = coercePreferences({ appearance: { theme: 'neon' }, run: { defaultSeed: '7' } });

    expect(coerced.appearance).toEqual(DEFAULT_PREFERENCES.appearance);
    expect(coerced.run.defaultSeed).toBe('7');
  });

  it('rejects a non-numeric seed', () => {
    expect(UserPreferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, run: { ...DEFAULT_PREFERENCES.run, defaultSeed: 'abc' } }).success).toBe(false);
  });
});

describe('merge', () => {
  it('changes one key without dropping its siblings', () => {
    const merged = mergePreferences(DEFAULT_PREFERENCES, { locale: { language: 'en' } });

    expect(merged.locale.language).toBe('en');
    expect(merged.locale.timeZone).toBe(DEFAULT_PREFERENCES.locale.timeZone);
  });
});

describe('theme resolution', () => {
  it('resolves system against the OS and an explicit choice against itself', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveMotion('system', true)).toBe('reduce');
    expect(resolveMotion('full', true)).toBe('full');
  });
});

describe('applyPreferences', () => {
  it('stamps the attributes the stylesheet keys off', () => {
    applyPreferences({
      ...DEFAULT_PREFERENCES,
      appearance: { theme: 'dark', density: 'compact', fontScale: 'lg', motion: 'reduce' },
      locale: { ...DEFAULT_PREFERENCES.locale, language: 'en' },
    });

    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.themeChoice).toBe('dark');
    expect(root.dataset.density).toBe('compact');
    expect(root.dataset.fontScale).toBe('lg');
    expect(root.dataset.motion).toBe('reduce');
    expect(root.lang).toBe('en');
  });
});

describe('storage', () => {
  it('round-trips through localStorage', () => {
    writeStoredPreferences({ ...DEFAULT_PREFERENCES, run: { ...DEFAULT_PREFERENCES.run, defaultSeed: '99' } });

    expect(coercePreferences(readStoredPreferences()).run.defaultSeed).toBe('99');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toContain('99');
  });

  it('reads the seed the old settings dialog wrote under its own key', () => {
    window.localStorage.setItem(LEGACY_SEED_KEY, '1234');
    expect(readLegacySeed()).toBe('1234');

    window.localStorage.setItem(LEGACY_SEED_KEY, 'not-a-seed');
    expect(readLegacySeed()).toBeNull();
  });

  it('survives storage that throws', () => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      expect(readStoredPreferences()).toBeNull();
      expect(readLegacySeed()).toBeNull();
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });
});
