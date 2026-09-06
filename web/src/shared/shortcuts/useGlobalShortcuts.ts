'use client';

import { useEffect } from 'react';
import { GLOBAL_SHORTCUTS, type GlobalActionId } from './registry';

/** Every id in the union needs a handler, so the Shortcuts section can render
 *  straight from the registry without anyone checking the list by hand.
 */
export type ShortcutHandlers = Record<GlobalActionId, () => void>;

const TEXT_ENTRY = /^(input|textarea|select)$/i;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TEXT_ENTRY.test(target.tagName) || target.isContentEditable;
}

function matchesEntry(event: KeyboardEvent, keys: string[]): boolean {
  const mod = keys.includes('mod');
  if (mod !== (event.metaKey || event.ctrlKey)) return false;
  const literal = keys.find((key) => key !== 'mod');
  if (!literal) return false;
  return event.key.toLowerCase() === literal.toLowerCase();
}

export function useGlobalShortcuts(handlers: ShortcutHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.repeat) return;
      for (const entry of GLOBAL_SHORTCUTS) {
        if (!matchesEntry(event, entry.keys)) continue;
        // An unmodified key would otherwise be swallowed mid-sentence; `?` is a
        // character someone can legitimately be typing.
        if (!entry.keys.includes('mod') && isTyping(event.target)) return;
        event.preventDefault();
        handlers[entry.action]();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, handlers]);
}
