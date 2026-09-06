'use client';

import { Bell, Database, Info, KeyRound, Keyboard, Languages, Palette, Play, User as UserIcon } from 'lucide-react';
import type { MessageKey } from '@/shared/i18n';

export type SectionId =
  | 'account' | 'appearance' | 'locale' | 'notifications'
  | 'run' | 'security' | 'shortcuts' | 'data' | 'about';

export type SectionGroup = 'personal' | 'workspace' | 'system';

export type SectionSpec = {
  id: SectionId;
  group: SectionGroup;
  labelKey: MessageKey;
  icon: typeof UserIcon;
  /** Every message this section renders that someone might search for. The
   *  search box matches translated text, so it keeps working in both languages
   *  without a second list of synonyms. */
  terms: MessageKey[];
};

export const SECTION_GROUPS: { id: SectionGroup; labelKey: MessageKey }[] = [
  { id: 'personal', labelKey: 'group.personal' },
  { id: 'workspace', labelKey: 'group.workspace' },
  { id: 'system', labelKey: 'group.system' },
];

export const SECTIONS: SectionSpec[] = [
  { id: 'account', group: 'personal', labelKey: 'section.account', icon: UserIcon,
    terms: ['account.displayName', 'account.email', 'account.role', 'account.joined', 'account.project', 'account.permissions'] },
  { id: 'appearance', group: 'personal', labelKey: 'section.appearance', icon: Palette,
    terms: ['appearance.theme', 'appearance.light', 'appearance.dark', 'appearance.system', 'appearance.density', 'appearance.fontScale', 'appearance.motion'] },
  { id: 'locale', group: 'personal', labelKey: 'section.locale', icon: Languages,
    terms: ['locale.language', 'locale.timeZone', 'locale.dateFormat', 'locale.timeFormat'] },
  { id: 'notifications', group: 'personal', labelKey: 'section.notifications', icon: Bell,
    terms: ['notifications.runCompleted', 'notifications.runFailed', 'notifications.reviewRequested', 'notifications.budgetWarning', 'notifications.digest', 'notifications.sound', 'notifications.email'] },
  { id: 'run', group: 'workspace', labelKey: 'section.run', icon: Play,
    terms: ['run.seed', 'run.seedMode', 'run.autoOpenCanvas', 'run.streamReasoning', 'run.confirmBeforeRun'] },
  { id: 'shortcuts', group: 'workspace', labelKey: 'section.shortcuts', icon: Keyboard,
    terms: ['shortcuts.scope.global', 'shortcuts.scope.chat', 'shortcuts.scope.dialog'] },
  { id: 'security', group: 'system', labelKey: 'section.security', icon: KeyRound,
    terms: ['security.change', 'security.newPassword', 'security.sessions', 'security.revokeAll'] },
  { id: 'data', group: 'system', labelKey: 'section.data', icon: Database,
    terms: ['data.export', 'data.reset', 'data.clearCache', 'data.danger', 'data.deleteAccount'] },
  { id: 'about', group: 'system', labelKey: 'section.about', icon: Info,
    terms: ['about.version', 'about.apiStatus', 'about.env', 'about.deps'] },
];

export const SECTION_IDS = SECTIONS.map((section) => section.id);

export function isSectionId(value: string | null | undefined): value is SectionId {
  return Boolean(value) && SECTION_IDS.includes(value as SectionId);
}

/** Vietnamese users type without diacritics as often as with them, so "bao mat"
 *  has to find "Bảo mật". Đ/đ is not a combining form, so it is mapped by hand.
 */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
