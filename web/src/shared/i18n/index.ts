'use client';

import { useCallback, useMemo } from 'react';
import { usePreferences } from '@/shared/preferences/PreferencesContext';
import type { DateFormat, Language, TimeFormat } from '@/shared/preferences/types';
import { en } from './en';
import { vi, type MessageKey } from './vi';

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { vi, en };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translate(language: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[language]?.[key] ?? vi[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

const INTL_LOCALE: Record<Language, string> = { vi: 'vi-VN', en: 'en-US' };

const DATE_PARTS: Record<DateFormat, Intl.DateTimeFormatOptions> = {
  'dd/MM/yyyy': { day: '2-digit', month: '2-digit', year: 'numeric' },
  'yyyy-MM-dd': { year: 'numeric', month: '2-digit', day: '2-digit' },
  'MM/dd/yyyy': { month: '2-digit', day: '2-digit', year: 'numeric' },
};

/** `Intl` picks the separator and order from the locale, which would ignore the
 *  user's explicit choice, so the parts are formatted and reassembled by hand.
 */
export function formatDate(value: Date, language: Language, dateFormat: DateFormat, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { ...DATE_PARTS[dateFormat], timeZone }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const [day, month, year] = [get('day'), get('month'), get('year')];
  if (dateFormat === 'yyyy-MM-dd') return `${year}-${month}-${day}`;
  if (dateFormat === 'MM/dd/yyyy') return `${month}/${day}/${year}`;
  return `${day}/${month}/${year}`;
}

export function formatTime(value: Date, language: Language, timeFormat: TimeFormat, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[language], {
    hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h', timeZone,
  }).format(value);
}

export function useLocaleFormat() {
  const { preferences } = usePreferences();
  const { language, dateFormat, timeFormat, timeZone } = preferences.locale;

  const t = useCallback<Translate>((key, vars) => translate(language, key, vars), [language]);

  return useMemo(() => ({
    t,
    language,
    locale: INTL_LOCALE[language],
    date: (value: Date | string) => formatDate(new Date(value), language, dateFormat, timeZone),
    time: (value: Date | string) => formatTime(new Date(value), language, timeFormat, timeZone),
    dateTime: (value: Date | string) => {
      const date = new Date(value);
      return `${formatDate(date, language, dateFormat, timeZone)} ${formatTime(date, language, timeFormat, timeZone)}`;
    },
  }), [dateFormat, language, t, timeFormat, timeZone]);
}

/** Role names are data on the auth model but chrome on screen, so their labels
 *  live in the dictionary rather than in `ROLE_CONFIGS`, which owns only the
 *  badge colours now.
 */
export const ROLE_LABEL_KEYS = {
  user: 'role.user', author: 'role.author', reviewer: 'role.reviewer',
  operator: 'role.operator', admin: 'role.admin',
} as const satisfies Record<string, MessageKey>;

export const ROLE_DESCRIPTION_KEYS = {
  user: 'role.user.desc', author: 'role.author.desc', reviewer: 'role.reviewer.desc',
  operator: 'role.operator.desc', admin: 'role.admin.desc',
} as const satisfies Record<string, MessageKey>;

export function roleLabelKey(role: string): MessageKey {
  return (ROLE_LABEL_KEYS as Record<string, MessageKey>)[role] ?? 'role.user';
}

export function useT(): Translate {
  return useLocaleFormat().t;
}

export type { MessageKey };
