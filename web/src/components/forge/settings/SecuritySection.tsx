'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Laptop } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import { settingsApi, type DeviceSession } from '@/shared/api/settings';
import { useLocaleFormat } from '@/shared/i18n';
import { cn } from '@/lib/utils';
import { Notice, PrimaryButton, SettingsSection } from './primitives';

/** Deliberately not a password-cracking estimate. It rewards the two things a
 *  user can act on — more characters, more kinds of character — and says so in
 *  three words rather than a score nobody can interpret.
 */
export function passwordStrength(value: string): 0 | 1 | 2 | 3 {
  if (value.length < 8) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  if (value.length >= 14 && classes >= 3) return 3;
  if (value.length >= 10 && classes >= 2) return 2;
  return 1;
}

function PasswordField({ id, label, value, onChange, onReveal, revealed, minLength }: {
  id: string; label: string; value: string; onChange: (next: string) => void;
  onReveal: () => void; revealed: boolean; minLength?: number;
}) {
  const { t } = useLocaleFormat();
  return (
    <div>
      <label htmlFor={id} className="block text-[length:calc(12.5px*var(--font-scale))] font-medium">{label}</label>
      <span className="relative mt-1.5 flex">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={minLength}
          required
          autoComplete={id === 'cur-pw' ? 'current-password' : 'new-password'}
          className="min-h-11 w-full rounded-lg border border-input bg-card px-3 pr-11 text-[length:calc(13px*var(--font-scale))] outline-none focus:ring-2 focus:ring-ring/25"
        />
        <button
          type="button"
          onClick={onReveal}
          aria-label={revealed ? t('security.hide') : t('security.show')}
          className="icon-button absolute right-1 top-1/2 size-9 -translate-y-1/2"
        >
          {revealed ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </span>
    </div>
  );
}

export function SecuritySection() {
  const { changePassword } = useAuth();
  const { t, dateTime } = useLocaleFormat();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const body = await settingsApi.listSessions();
      setSessions(body.sessions);
      setSessionsError(false);
    } catch {
      setSessions(null);
      setSessionsError(true);
    }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = !busy && current.length > 0 && next.length >= 8 && confirm === next;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setNotice({ tone: 'ok', text: t('security.changed') });
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : t('security.changeFailed') });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await settingsApi.revokeSession(sessionId);
      await loadSessions();
    } catch {
      setSessionsError(true);
    } finally {
      setRevoking(null);
    }
  };

  const strengthLabels = [t('security.weak'), t('security.weak'), t('security.fair'), t('security.strong')];
  const strengthTone = ['bg-destructive', 'bg-destructive', 'bg-warning-foreground', 'bg-success-foreground'];

  return (
    <div className="space-y-6">
      <SettingsSection title={t('security.change')}>
        <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-3">
          <PasswordField id="cur-pw" label={t('security.currentPassword')} value={current} onChange={setCurrent} revealed={revealed} onReveal={() => setRevealed((on) => !on)} />
          <div>
            <PasswordField id="new-pw" label={t('security.newPassword')} value={next} onChange={setNext} revealed={revealed} onReveal={() => setRevealed((on) => !on)} minLength={8} />
            <div className="mt-1.5 flex items-center gap-2">
              <span aria-hidden="true" className="flex h-1 flex-1 gap-1 overflow-hidden rounded-full">
                {[0, 1, 2].map((index) => (
                  <span key={index} className={cn('h-full flex-1 rounded-full transition-colors', index < strength ? strengthTone[strength] : 'bg-surface-strong')} />
                ))}
              </span>
              <span className="text-[length:calc(11px*var(--font-scale))] text-muted-foreground">
                {next ? `${t('security.strength')}: ${strengthLabels[strength]}` : t('security.passwordHint')}
              </span>
            </div>
          </div>
          <PasswordField id="confirm-pw" label={t('security.confirmPassword')} value={confirm} onChange={setConfirm} revealed={revealed} onReveal={() => setRevealed((on) => !on)} minLength={8} />
          {mismatch ? <Notice tone="error">{t('security.mismatch')}</Notice> : null}
          <PrimaryButton type="submit" disabled={!canSubmit}>{busy ? t('security.changing') : t('security.change')}</PrimaryButton>
          {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
          <p className="pt-1 text-[length:calc(11.5px*var(--font-scale))] leading-relaxed text-muted-foreground">{t('security.cookieNote')}</p>
        </form>
      </SettingsSection>

      <SettingsSection title={t('security.sessions')} description={t('security.sessionsHint')}>
        {sessionsError ? (
          <Notice tone="info">{t('security.sessionsUnavailable')}</Notice>
        ) : (
          <>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-surface/50">
              {(sessions ?? []).map((item) => (
                <li key={item.session_id} className="flex items-center gap-3 p-3">
                  <Laptop aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:calc(12.5px*var(--font-scale))] font-medium">
                      {item.device} · {item.browser}
                      {item.current ? <span className="ml-2 rounded-md bg-grounded px-1.5 py-0.5 text-[length:calc(10.5px*var(--font-scale))] font-semibold text-grounded-foreground">{t('security.thisDevice')}</span> : null}
                    </p>
                    <p className="truncate text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">
                      {item.location} · {item.ip} · {t('security.lastSeen')} {dateTime(item.last_seen_at)}
                    </p>
                  </div>
                  {item.current ? null : (
                    <button type="button" onClick={() => void revoke(item.session_id)} disabled={revoking === item.session_id} className="control-button min-h-9 shrink-0 disabled:opacity-45">
                      {t('security.revoke')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {(sessions ?? []).some((item) => !item.current) ? (
              <button
                type="button"
                onClick={() => void settingsApi.revokeOtherSessions().then(loadSessions).catch(() => setSessionsError(true))}
                className="control-button min-h-9 text-destructive"
              >
                {t('security.revokeAll')}
              </button>
            ) : null}
          </>
        )}
      </SettingsSection>
    </div>
  );
}
