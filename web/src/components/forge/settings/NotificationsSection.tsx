'use client';

import { SelectField } from '../SelectField';
import { usePreferences } from '@/shared/preferences/PreferencesContext';
import type { Digest, NotificationEvent } from '@/shared/preferences/types';
import { useLocaleFormat } from '@/shared/i18n';
import type { MessageKey } from '@/shared/i18n';
import { Notice, SettingRow, SettingsSection, Toggle } from './primitives';

const EVENTS: { id: NotificationEvent; labelKey: MessageKey }[] = [
  { id: 'runCompleted', labelKey: 'notifications.runCompleted' },
  { id: 'runFailed', labelKey: 'notifications.runFailed' },
  { id: 'reviewRequested', labelKey: 'notifications.reviewRequested' },
  { id: 'budgetWarning', labelKey: 'notifications.budgetWarning' },
];

export function NotificationsSection() {
  const { preferences, update } = usePreferences();
  const { t } = useLocaleFormat();
  const notifications = preferences.notifications;

  const setChannel = (event: NotificationEvent, channel: 'inApp' | 'email', value: boolean) => {
    update('notifications', { [event]: { ...notifications[event], [channel]: value } });
  };

  return (
    <div className="space-y-6">
      <SettingsSection title={t('section.notifications')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 text-[length:calc(11px*var(--font-scale))] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t('notifications.event')}</th>
                <th scope="col" className="w-24 py-2 text-center text-[length:calc(11px*var(--font-scale))] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t('notifications.inApp')}</th>
                <th scope="col" className="w-24 py-2 text-center text-[length:calc(11px*var(--font-scale))] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t('notifications.email')}</th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map(({ id, labelKey }) => (
                <tr key={id} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2.5 text-[length:calc(12.5px*var(--font-scale))] font-medium">{t(labelKey)}</th>
                  <td className="py-2.5 text-center">
                    <Toggle
                      checked={notifications[id].inApp}
                      onChange={(value) => setChannel(id, 'inApp', value)}
                      label={`${t(labelKey)} — ${t('notifications.inApp')}`}
                    />
                  </td>
                  <td className="py-2.5 text-center">
                    <Toggle
                      checked={notifications[id].email}
                      onChange={(value) => setChannel(id, 'email', value)}
                      label={`${t(labelKey)} — ${t('notifications.email')}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Notice tone="info">{t('notifications.deliveryNote')}</Notice>
      </SettingsSection>

      <SettingsSection title={t('notifications.digest')}>
        <SettingRow
          label={t('notifications.digest')}
          hint={t('notifications.digestHint')}
          control={
            <SelectField
              value={notifications.digest}
              options={[
                { value: 'off', label: t('notifications.off') },
                { value: 'daily', label: t('notifications.daily') },
                { value: 'weekly', label: t('notifications.weekly') },
              ]}
              aria-label={t('notifications.digest')}
              onChange={(next) => update('notifications', { digest: next as Digest })}
              className="w-40"
            />
          }
        />
        <SettingRow
          label={t('notifications.sound')}
          hint={t('notifications.soundHint')}
          control={<Toggle checked={notifications.sound} onChange={(value) => update('notifications', { sound: value })} label={t('notifications.sound')} />}
        />
      </SettingsSection>
    </div>
  );
}
