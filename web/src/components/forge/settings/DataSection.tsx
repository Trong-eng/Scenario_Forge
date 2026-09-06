'use client';

import { useState } from 'react';
import { usePreferences } from '@/shared/preferences/PreferencesContext';
import { THEME_STORAGE_KEY } from '@/shared/preferences/applyPreferences';
import { useLocaleFormat } from '@/shared/i18n';
import { Notice, SettingRow, SettingsSection } from './primitives';

export function DataSection() {
  const { preferences, reset } = usePreferences();
  const { t } = useLocaleFormat();
  const [cleared, setCleared] = useState(false);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(preferences, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'scenario-forge-preferences.json';
    anchor.click();
    // Revoking immediately would race the download in Safari; one tick is enough.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const clearLocal = () => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('sf_') && key !== THEME_STORAGE_KEY) window.localStorage.removeItem(key);
      }
      setCleared(true);
    } catch {
      setCleared(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection title={t('section.data')}>
        <SettingRow
          label={t('data.export')}
          hint={t('data.exportHint')}
          control={<button type="button" onClick={exportJson} className="control-button min-h-9">{t('data.exportAction')}</button>}
        />
        <SettingRow
          label={t('data.reset')}
          hint={t('data.resetHint')}
          control={
            <button
              type="button"
              onClick={() => { if (window.confirm(t('data.resetConfirm'))) reset(); }}
              className="control-button min-h-9"
            >
              {t('data.resetAction')}
            </button>
          }
        />
        <SettingRow
          label={t('data.clearCache')}
          hint={t('data.clearCacheHint')}
          control={<button type="button" onClick={clearLocal} className="control-button min-h-9">{t('data.clearCacheAction')}</button>}
        />
        {cleared ? <Notice tone="ok">{t('data.clearCacheAction')} ✓</Notice> : null}
      </SettingsSection>

      {/* The one control on this screen that does nothing, and the only one
          allowed to: deleting an account is irreversible, so a mock would be a
          lie rather than a placeholder. It stays disabled and says why. */}
      <SettingsSection title={t('data.danger')}>
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <SettingRow
            label={t('data.deleteAccount')}
            hint={t('data.deleteAccountHint')}
            control={
              <button type="button" disabled aria-disabled="true" className="control-button min-h-9 border-destructive/40 text-destructive opacity-45">
                {t('data.deleteAccount')}
              </button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
