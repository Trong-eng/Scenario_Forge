import type { MessageKey } from '@/shared/i18n/vi';

/** Actions this hook owns and binds. The union is what makes the Shortcuts
 *  section trustworthy: `useGlobalShortcuts` takes a handler per id, so a
 *  shortcut cannot be listed without something to run.
 */
export type GlobalActionId = 'openSettings' | 'openShortcuts' | 'focusComposer' | 'toggleSidebar';

export type ShortcutScope = 'global' | 'chat' | 'dialog';

export type ShortcutEntry = {
  id: string;
  /** Present only for shortcuts this registry binds itself. */
  action?: GlobalActionId;
  scope: ShortcutScope;
  /** `mod` renders as ⌘ on Apple platforms and Ctrl everywhere else. */
  keys: string[];
  label: string;
  labelKey?: MessageKey;
};

export const SHORTCUTS: ShortcutEntry[] = [
  { id: 'open-settings', action: 'openSettings', scope: 'global', keys: ['mod', ','], label: 'Mở Cài đặt' },
  { id: 'open-shortcuts', action: 'openShortcuts', scope: 'global', keys: ['?'], label: 'Mở bảng phím tắt' },
  { id: 'focus-composer', action: 'focusComposer', scope: 'global', keys: ['mod', 'K'], label: 'Nhảy tới ô nhập tin nhắn' },
  { id: 'toggle-sidebar', action: 'toggleSidebar', scope: 'global', keys: ['mod', 'B'], label: 'Ẩn/hiện thanh bên' },
  { id: 'send-message', scope: 'chat', keys: ['Enter'], label: 'Gửi tin nhắn' },
  { id: 'newline', scope: 'chat', keys: ['Shift', 'Enter'], label: 'Xuống dòng trong tin nhắn' },
  { id: 'close-layer', scope: 'dialog', keys: ['Esc'], label: 'Đóng lớp đang mở' },
  { id: 'cycle-focus', scope: 'dialog', keys: ['Tab'], label: 'Di chuyển trong hộp thoại' },
];

export const GLOBAL_SHORTCUTS = SHORTCUTS.filter((entry): entry is ShortcutEntry & { action: GlobalActionId } => Boolean(entry.action));

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

export function renderKey(key: string, apple: boolean): string {
  if (key === 'mod') return apple ? '⌘' : 'Ctrl';
  if (key === 'Shift') return apple ? '⇧' : 'Shift';
  if (key === 'Enter') return apple ? '↵' : 'Enter';
  return key;
}
