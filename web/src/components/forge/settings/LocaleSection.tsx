'use client';

import { useMemo } from 'react';
import { SelectField } from '../SelectField';
import { usePreferences } from '@/shared/preferences/PreferencesContext';
import type { DateFormat, Language, TimeFormat } from '@/shared/preferences/types';
import { useLocaleFormat } from '@/shared/i18n';
import { Notice, SegmentedControl, SettingRow, SettingsSection } from './primitives';

/** A short, curated list beats `Intl.supportedValuesOf('timeZone')` here: that
 *  returns several hundred entries, and the zones this product is used from are
 *  few. The browser's own zone is added so nobody has to hunt for it.
 */
const BASE_ZONES = ['Asia/Ho_Chi_Minh', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export function LocaleSection() {
  const { preferences, update } = usePreferences();
  const { t, dateTime } = useLocaleFormat();
  const { language, timeZone, dateFormat, timeFormat } = preferences.locale;

  const zones = useMemo(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const all = [...new Set([detected, ...BASE_ZONES, timeZone].filter(Boolean))];
    return all.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
  }, [timeZone]);

  return (
    <div className="space-y-6">
      <SettingsSection title={t('locale.language')}>
        <SettingRow
          label={t('locale.language')}
          hint={t('locale.languageHint')}
          control={
            <SegmentedControl<Language>
              value={language}
              options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]}
              label={t('locale.language')}
              onChange={(next) => update('locale', { language: next })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t('locale.timeZone')}>
        <SettingRow
          label={t('locale.timeZone')}
          hint={t('locale.timeZoneHint')}
          control={
            <SelectField
              value={timeZone}
              options={zones}
              aria-label={t('locale.timeZone')}
              onChange={(next) => update('locale', { timeZone: next })}
              className="w-56 max-sm:w-full"
            />
          }
        />
        <SettingRow
          label={t('locale.dateFormat')}
          control={
            <SegmentedControl<DateFormat>
              value={dateFormat}
              options={[
                { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy' },
                { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' },
                { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' },
              ]}
              label={t('locale.dateFormat')}
              onChange={(next) => update('locale', { dateFormat: next })}
            />
          }
        />
        <SettingRow
          label={t('locale.timeFormat')}
          control={
            <SegmentedControl<TimeFormat>
              value={timeFormat}
              options={[{ value: '24h', label: '24h' }, { value: '12h', label: '12h' }]}
              label={t('locale.timeFormat')}
              onChange={(next) => update('locale', { timeFormat: next })}
            />
          }
        />
        <Notice tone="info">
          {t('locale.preview')}: <span className="font-mono">{dateTime(new Date())}</span>
        </Notice>
      </SettingsSection>
    </div>
  );
}
