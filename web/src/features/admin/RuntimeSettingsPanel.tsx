'use client';

import { useCallback, useEffect, useState } from 'react';
import { SelectField } from '@/components/forge/SelectField';
import { ApiError } from '@/shared/api/client';
import { settingsApi, type RuntimeSettings } from '@/shared/api/settings';

const MAX_SECONDS = 86_400;

/** Consumes `/api/v1/admin/settings`, which the backend has shipped and
 *  registered (`src/main.py:416`) but nothing in the web tree called. The
 *  bounds and the allowlist here mirror `RuntimeSettingsPatch` so the form
 *  rejects what the server would reject, instead of round-tripping to find out.
 */
export function RuntimeSettingsPanel() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [draft, setDraft] = useState<Pick<RuntimeSettings, 'provider' | 'model' | 'backend_active_limit_seconds' | 'human_response_limit_seconds'> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'denied' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const adopt = useCallback((next: RuntimeSettings) => {
    setSettings(next);
    setDraft({
      provider: next.provider,
      model: next.model,
      backend_active_limit_seconds: next.backend_active_limit_seconds,
      human_response_limit_seconds: next.human_response_limit_seconds,
    });
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    setMessage('');
    try {
      adopt(await settingsApi.getRuntimeSettings());
      setState('ready');
    } catch (cause) {
      if (cause instanceof ApiError && cause.envelope.code === 'ADMIN_REQUIRED') {
        setState('denied');
        setMessage('Cần vai trò admin để xem mục này.');
        return;
      }
      setState('error');
      setMessage(cause instanceof Error ? cause.message : 'Không đọc được runtime settings.');
    }
  }, [adopt]);

  useEffect(() => { void load(); }, [load]);

  const inBounds = (value: number) => Number.isInteger(value) && value > 0 && value <= MAX_SECONDS;
  const valid = Boolean(draft) && inBounds(draft!.backend_active_limit_seconds) && inBounds(draft!.human_response_limit_seconds);

  const save = async () => {
    if (!draft || !valid) return;
    setState('saving');
    setMessage('');
    try {
      adopt(await settingsApi.patchRuntimeSettings(draft));
      setState('ready');
      setMessage('Đã lưu runtime settings.');
    } catch (cause) {
      setState('ready');
      setMessage(cause instanceof ApiError ? `${cause.envelope.code}: ${cause.envelope.message}` : 'Không lưu được runtime settings.');
    }
  };

  const rotateSecret = async () => {
    setMessage('');
    try {
      await settingsApi.replaceSecret('llm_api_key');
      setMessage('Đã gửi yêu cầu xoay secret.');
    } catch (cause) {
      // 501 SECRET_MANAGER_UNAVAILABLE is the server telling the truth about
      // this deployment, so it is shown as-is rather than as a failure.
      setMessage(cause instanceof ApiError ? `${cause.envelope.code}: ${cause.envelope.message}` : 'Không xoay được secret.');
    }
  };

  if (state === 'loading') return <p className="mt-2 text-sm text-muted-foreground">Đang tải runtime settings…</p>;
  if (state === 'denied' || !settings || !draft) {
    return (
      <div className="mt-2 space-y-2">
        <p role="status" className="text-sm text-muted-foreground">{message || 'Không đọc được runtime settings.'}</p>
        {state === 'error' ? <button type="button" onClick={() => void load()} className="rounded border px-3 py-1.5 text-sm">Thử lại</button> : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      {settings.restart_required ? (
        <p role="status" className="rounded-lg border border-warning-foreground/30 bg-warning px-3 py-2 text-sm text-warning-foreground">
          Cấu hình đã lưu nhưng process đang chạy vẫn dùng giá trị cũ — cần khởi động lại backend để áp dụng.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="block text-sm font-medium" id="runtime-provider-label">Provider</span>
          <SelectField
            value={draft.provider}
            options={settings.allowed_providers.map((value) => ({ value, label: value }))}
            aria-label="Provider"
            onChange={(value) => setDraft({ ...draft, provider: value })}
          />
        </div>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Model</span>
          <SelectField
            value={draft.model}
            options={settings.allowed_models.map((value) => ({ value, label: value }))}
            aria-label="Model"
            onChange={(value) => setDraft({ ...draft, model: value })}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="backend-active-limit" className="block text-sm font-medium">Backend active limit (giây)</label>
          <input
            id="backend-active-limit" aria-describedby="backend-active-limit-hint"
            type="number" min={1} max={MAX_SECONDS} value={draft.backend_active_limit_seconds}
            onChange={(event) => setDraft({ ...draft, backend_active_limit_seconds: Number(event.target.value) })}
            className="w-full rounded border px-3 py-2 tabular-nums"
          />
          <p id="backend-active-limit-hint" className="text-xs text-muted-foreground">1 – {MAX_SECONDS.toLocaleString('vi-VN')} giây.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="human-response-limit" className="block text-sm font-medium">Human response limit (giây)</label>
          <input
            id="human-response-limit" aria-describedby="human-response-limit-hint"
            type="number" min={1} max={MAX_SECONDS} value={draft.human_response_limit_seconds}
            onChange={(event) => setDraft({ ...draft, human_response_limit_seconds: Number(event.target.value) })}
            className="w-full rounded border px-3 py-2 tabular-nums"
          />
          <p id="human-response-limit-hint" className="text-xs text-muted-foreground">1 – {MAX_SECONDS.toLocaleString('vi-VN')} giây.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={state === 'saving' || !valid} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
          {state === 'saving' ? 'Đang lưu…' : 'Lưu runtime settings'}
        </button>
        <button type="button" onClick={() => adopt(settings)} className="rounded border px-4 py-2">Hoàn tác</button>
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold">API key</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {settings.api_key_configured
            ? <>Đã cấu hình, kết thúc bằng <code className="font-mono">••••{settings.api_key_last4 ?? '????'}</code>. Khoá không bao giờ hiển thị plaintext.</>
            : 'Chưa cấu hình API key trên máy chủ.'}
        </p>
        <button type="button" onClick={() => void rotateSecret()} className="mt-3 rounded border px-3 py-1.5 text-sm">Xoay secret</button>
      </div>

      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
