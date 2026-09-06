'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import type { UserRole } from '@/shared/auth/types';
import { settingsApi } from '@/shared/api/settings';
import { roleLabelKey, useLocaleFormat } from '@/shared/i18n';
import type { LiveSession } from '../liveTypes';
import { DefinitionList, Notice, PrimaryButton, Row, SettingRow, SettingsSection, TextInput } from './primitives';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

export function AccountSection({ session, permissions }: { session: LiveSession | null; permissions: string[] }) {
  const { user, refreshSession } = useAuth();
  const { t, date } = useLocaleFormat();
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

  const dirty = name.trim().length > 0 && name.trim() !== (user?.name ?? '');

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await settingsApi.patchProfile(name.trim());
      await refreshSession();
      setNotice({ tone: 'ok', text: t('account.saved') });
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : t('settings.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const role = (user?.role ?? 'user') as UserRole;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-[length:calc(15px*var(--font-scale))] font-semibold text-primary">
          {initials(user?.name ?? '')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[length:calc(14px*var(--font-scale))] font-semibold">{user?.name ?? '—'}</p>
          <p className="truncate text-[length:calc(12px*var(--font-scale))] text-muted-foreground">{user?.email ?? '—'}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-md border border-border bg-surface px-2 py-0.5 text-[length:calc(11px*var(--font-scale))] font-medium text-muted-foreground">
          {t(roleLabelKey(role))}
        </span>
      </div>

      <SettingsSection title={t('account.displayName')}>
        <SettingRow
          label={t('account.displayName')}
          hint={t('account.displayNameHint')}
          htmlFor="account-name"
          control={
            <span className="flex items-center gap-2">
              <TextInput id="account-name" value={name} onChange={setName} maxLength={80} className="w-56 max-sm:w-full" />
              <PrimaryButton onClick={() => void save()} disabled={busy || !dirty}>
                {busy ? t('settings.saving') : t('account.save')}
              </PrimaryButton>
            </span>
          }
        />
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      </SettingsSection>

      <SettingsSection title={t('section.account')} description={t('account.emailHint')}>
        <DefinitionList>
          <Row label={t('account.email')} value={user?.email ?? '—'} />
          <Row label={t('account.role')} value={t(roleLabelKey(role))} />
          <Row label={t('account.joined')} value={user?.created_at ? date(user.created_at) : '—'} />
        </DefinitionList>
      </SettingsSection>

      <SettingsSection title={t('account.project')} description={t('account.permissionsHint')}>
        <DefinitionList>
          <Row
            label={t('account.project')}
            value={
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-[length:calc(12px*var(--font-scale))]">{session?.projectId ?? t('account.notConnected')}</span>
                {session ? (
                  <button
                    type="button"
                    aria-label={t('account.projectCopy')}
                    className="icon-button size-7"
                    onClick={() => {
                      void navigator.clipboard?.writeText(session.projectId);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
                  </button>
                ) : null}
              </span>
            }
          />
        </DefinitionList>
        <div className="flex flex-wrap gap-1.5">
          {permissions.length
            ? permissions.map((permission) => (
                <span key={permission} className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[length:calc(11px*var(--font-scale))] text-muted-foreground">{permission}</span>
              ))
            : <span className="text-[length:calc(12px*var(--font-scale))] text-muted-foreground">{t('account.noPermissions')}</span>}
        </div>
      </SettingsSection>
    </div>
  );
}
