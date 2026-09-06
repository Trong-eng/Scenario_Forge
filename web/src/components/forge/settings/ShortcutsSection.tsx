'use client';

import { useMemo } from 'react';
import { SHORTCUTS, isApplePlatform, renderKey, type ShortcutScope } from '@/shared/shortcuts/registry';
import { useLocaleFormat } from '@/shared/i18n';
import type { MessageKey } from '@/shared/i18n';
import { Notice, SettingsSection } from './primitives';

const SCOPE_LABELS: Record<ShortcutScope, MessageKey> = {
  global: 'shortcuts.scope.global',
  chat: 'shortcuts.scope.chat',
  dialog: 'shortcuts.scope.dialog',
};

export function ShortcutsSection() {
  const { t } = useLocaleFormat();
  const apple = useMemo(() => isApplePlatform(), []);
  const scopes: ShortcutScope[] = ['global', 'chat', 'dialog'];

  return (
    <div className="space-y-6">
      {scopes.map((scope) => {
        const entries = SHORTCUTS.filter((entry) => entry.scope === scope);
        if (!entries.length) return null;
        return (
          <SettingsSection key={scope} title={t(SCOPE_LABELS[scope])}>
            <dl className="rounded-xl border border-border/70 bg-surface/50 px-3">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
                  <dt className="min-w-0 text-[length:calc(12.5px*var(--font-scale))]">{entry.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {entry.keys.map((key) => (
                      <kbd key={key} className="min-w-6 rounded-md border border-border bg-card px-1.5 py-0.5 text-center font-mono text-[length:calc(11px*var(--font-scale))] text-muted-foreground shadow-sm">
                        {renderKey(key, apple)}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </SettingsSection>
        );
      })}
      <Notice tone="info">{t('shortcuts.hint')}</Notice>
    </div>
  );
}
