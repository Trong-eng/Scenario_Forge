'use client';

import { usePreferences } from '@/shared/preferences/PreferencesContext';
import type { SeedMode } from '@/shared/preferences/types';
import { useLocaleFormat } from '@/shared/i18n';
import { SegmentedControl, SettingRow, SettingsSection, TextInput, Toggle } from './primitives';

export function RunDefaultsSection() {
  const { preferences, update } = usePreferences();
  const { t } = useLocaleFormat();
  const run = preferences.run;

  return (
    <div className="space-y-6">
      <SettingsSection title={t('section.run')}>
        <SettingRow
          label={t('run.seedMode')}
          hint={run.seedMode === 'random' ? t('run.randomHint') : undefined}
          control={
            <SegmentedControl<SeedMode>
              value={run.seedMode}
              options={[{ value: 'fixed', label: t('run.fixed') }, { value: 'random', label: t('run.random') }]}
              label={t('run.seedMode')}
              onChange={(next) => update('run', { seedMode: next })}
            />
          }
        />
        {run.seedMode === 'fixed' ? (
          <SettingRow
            label={t('run.seed')}
            hint={t('run.seedHint')}
            htmlFor="run-seed"
            control={
              <TextInput
                id="run-seed"
                value={run.defaultSeed}
                inputMode="numeric"
                // Non-digits are rejected at the edge rather than normalised at
                // run time, so the field never shows a value the Run will not use.
                onChange={(next) => { if (/^\d*$/.test(next)) update('run', { defaultSeed: next }); }}
                className="w-32 text-right font-mono tabular-nums"
              />
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('run.behaviour')}>
        <SettingRow
          label={t('run.autoOpenCanvas')}
          hint={t('run.autoOpenCanvasHint')}
          control={<Toggle checked={run.autoOpenCanvas} onChange={(value) => update('run', { autoOpenCanvas: value })} label={t('run.autoOpenCanvas')} />}
        />
        <SettingRow
          label={t('run.streamReasoning')}
          hint={t('run.streamReasoningHint')}
          control={<Toggle checked={run.streamReasoning} onChange={(value) => update('run', { streamReasoning: value })} label={t('run.streamReasoning')} />}
        />
        <SettingRow
          label={t('run.confirmBeforeRun')}
          hint={t('run.confirmBeforeRunHint')}
          control={<Toggle checked={run.confirmBeforeRun} onChange={(value) => update('run', { confirmBeforeRun: value })} label={t('run.confirmBeforeRun')} />}
        />
      </SettingsSection>
    </div>
  );
}
