'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { usePreferences } from '@/shared/preferences/PreferencesContext';
import type { Density, FontScale, MotionChoice, ThemeChoice } from '@/shared/preferences/types';
import { useLocaleFormat } from '@/shared/i18n';
import { SegmentedControl, SettingRow, SettingsSection } from './primitives';

export function AppearanceSection() {
  const { preferences, update } = usePreferences();
  const { t } = useLocaleFormat();
  const { theme, density, fontScale, motion } = preferences.appearance;

  const themeOptions: { value: ThemeChoice; label: string; icon: JSX.Element }[] = [
    { value: 'light', label: t('appearance.light'), icon: <Sun aria-hidden="true" className="size-3.5" /> },
    { value: 'dark', label: t('appearance.dark'), icon: <Moon aria-hidden="true" className="size-3.5" /> },
    { value: 'system', label: t('appearance.system'), icon: <Monitor aria-hidden="true" className="size-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <SettingsSection title={t('appearance.theme')} description={t('appearance.themeHint')}>
        <SegmentedControl<ThemeChoice>
          value={theme}
          options={themeOptions}
          label={t('appearance.theme')}
          onChange={(next) => update('appearance', { theme: next })}
        />
        {/* The preview is built from the same tokens as the app, so it shows the
            palette that is actually live rather than a picture of one. */}
        <div aria-hidden="true" className="mt-3 overflow-hidden rounded-xl border border-border">
          <div className="flex">
            <div className="w-16 shrink-0 space-y-1.5 bg-sidebar p-2">
              <div className="h-1.5 w-9 rounded-full bg-sidebar-accent" />
              <div className="h-1.5 w-11 rounded-full bg-sidebar-accent/70" />
              <div className="h-1.5 w-7 rounded-full bg-sidebar-accent/50" />
            </div>
            <div className="flex-1 space-y-2 bg-background p-3">
              <div className="h-2 w-24 rounded-full bg-foreground/70" />
              <div className="space-y-1.5 rounded-lg border border-border bg-card p-2">
                <div className="h-1.5 w-full rounded-full bg-muted-foreground/40" />
                <div className="h-1.5 w-2/3 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="flex gap-1.5">
                <span className="h-4 w-12 rounded-md bg-primary" />
                <span className="h-4 w-10 rounded-md bg-grounded" />
                <span className="h-4 w-10 rounded-md bg-userset" />
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('appearance.density')}>
        <SettingRow
          label={t('appearance.density')}
          hint={t('appearance.densityHint')}
          control={
            <SegmentedControl<Density>
              value={density}
              options={[
                { value: 'comfortable', label: t('appearance.comfortable') },
                { value: 'compact', label: t('appearance.compact') },
              ]}
              label={t('appearance.density')}
              onChange={(next) => update('appearance', { density: next })}
            />
          }
        />
        <SettingRow
          label={t('appearance.fontScale')}
          control={
            <SegmentedControl<FontScale>
              value={fontScale}
              options={[
                { value: 'sm', label: t('appearance.sm') },
                { value: 'md', label: t('appearance.md') },
                { value: 'lg', label: t('appearance.lg') },
              ]}
              label={t('appearance.fontScale')}
              onChange={(next) => update('appearance', { fontScale: next })}
            />
          }
        />
        <SettingRow
          label={t('appearance.motion')}
          hint={t('appearance.motionHint')}
          control={
            <SegmentedControl<MotionChoice>
              value={motion}
              options={[
                { value: 'system', label: t('appearance.system') },
                { value: 'full', label: t('appearance.motionFull') },
                { value: 'reduce', label: t('appearance.motionReduce') },
              ]}
              label={t('appearance.motion')}
              onChange={(next) => update('appearance', { motion: next })}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
