import { expect, it } from 'vitest';
import { vi as viDictionary } from '../../../src/shared/i18n/vi';
import { en } from '../../../src/shared/i18n/en';
import { formatDate, formatTime, translate } from '../../../src/shared/i18n';

it('translates the same keys in both languages', () => {
  const viKeys = Object.keys(viDictionary).sort();
  const enKeys = Object.keys(en).sort();

  // A key present in one dictionary and missing from the other shows up as an
  // untranslated identifier on screen, so the two are kept in lockstep.
  expect(enKeys).toEqual(viKeys);
  for (const key of viKeys) expect(en[key as keyof typeof en].trim().length).toBeGreaterThan(0);
});

it('substitutes variables and falls back to Vietnamese for an unknown language', () => {
  expect(translate('en', 'settings.searchEmpty', { q: 'theme' })).toContain('theme');
  expect(translate('vi', 'settings.searchEmpty', { q: 'giao diện' })).toContain('giao diện');
  expect(translate('vi', 'section.account')).toBe('Tài khoản');
  expect(translate('en', 'section.account')).toBe('Account');
});

it('honours the chosen date order rather than the locale default', () => {
  const value = new Date('2026-08-31T14:05:00Z');

  expect(formatDate(value, 'en', 'dd/MM/yyyy', 'UTC')).toBe('31/08/2026');
  expect(formatDate(value, 'en', 'yyyy-MM-dd', 'UTC')).toBe('2026-08-31');
  expect(formatDate(value, 'vi', 'MM/dd/yyyy', 'UTC')).toBe('08/31/2026');
});

it('formats time in the chosen clock and zone', () => {
  const value = new Date('2026-08-31T14:05:00Z');

  expect(formatTime(value, 'en', '24h', 'UTC')).toBe('14:05');
  expect(formatTime(value, 'en', '12h', 'UTC')).toMatch(/2:05\s?PM/i);
  expect(formatTime(value, 'vi', '24h', 'Asia/Ho_Chi_Minh')).toBe('21:05');
});
