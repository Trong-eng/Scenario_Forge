'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLocaleFormat } from '@/shared/i18n';
import { DefinitionList, Notice, Row, SettingsSection } from './primitives';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; detail: Record<string, unknown> }
  | { status: 'error'; message: string };

export function AboutSection() {
  const { t } = useLocaleFormat();
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  /** The previous version collapsed every failure into the string
   *  "unreachable" — a 500 from a running server and a dead socket looked
   *  identical, and there was no way to retry. Both are separated here.
   */
  const check = useCallback(async () => {
    setHealth({ status: 'loading' });
    try {
      const response = await fetch(`${API}/health`, { credentials: 'include' });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        setHealth({ status: 'error', message: `HTTP ${response.status}` });
        return;
      }
      const detail = (body?.detail ?? body ?? {}) as Record<string, unknown>;
      setHealth({ status: 'ok', detail });
    } catch (cause) {
      setHealth({ status: 'error', message: cause instanceof Error ? cause.message : t('about.unreachable') });
    }
  }, [t]);

  useEffect(() => { void check(); }, [check]);

  const detail = health.status === 'ok' ? health.detail : undefined;
  const deps = detail?.build_dependencies as { configured?: boolean; ready?: boolean } | undefined;
  const yesNo = (value: boolean | undefined) => (value === undefined ? '—' : value ? t('about.yes') : t('about.no'));

  return (
    <div className="space-y-6">
      <SettingsSection title={t('section.about')}>
        <DefinitionList>
          <Row label={t('about.version')} value={<span className="font-mono">{VERSION}</span>} />
          <Row
            label={t('about.apiStatus')}
            value={
              health.status === 'loading' ? t('about.checking')
                : health.status === 'error' ? t('about.unreachable')
                : String(detail?.status ?? 'ok')
            }
          />
          <Row label={t('about.env')} value={String(detail?.env ?? '—')} />
          <Row
            label={t('about.deps')}
            value={deps ? `${t('about.configured')}: ${yesNo(deps.configured)} · ${t('about.ready')}: ${yesNo(deps.ready)}` : '—'}
          />
        </DefinitionList>
        {health.status === 'error' ? <Notice tone="error">{health.message}</Notice> : null}
        <button type="button" onClick={() => void check()} disabled={health.status === 'loading'} className="control-button min-h-9 disabled:opacity-45">
          <RefreshCw aria-hidden="true" className="size-3.5" />
          {t('about.refresh')}
        </button>
      </SettingsSection>
    </div>
  );
}
