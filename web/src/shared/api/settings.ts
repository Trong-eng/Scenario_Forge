import { z } from 'zod';
import { ApiError } from './client';
import { UserPreferencesSchema, type UserPreferences, type UserPreferencesPatch } from '@/shared/preferences/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';

/** Mirrors `RuntimeSettingsView` in `src/models/scenario_forge/admin_settings.py`. */
export const RuntimeSettingsSchema = z.object({
  provider: z.string(),
  model: z.string(),
  backend_active_limit_seconds: z.number().int(),
  human_response_limit_seconds: z.number().int(),
  allowed_providers: z.array(z.string()),
  allowed_models: z.array(z.string()),
  api_key_configured: z.boolean(),
  api_key_last4: z.string().nullable().default(null),
  restart_required: z.boolean().default(false),
});

export const MePreferencesSchema = z.object({
  preferences: UserPreferencesSchema,
  updated_at: z.string(),
});

export const DeviceSessionSchema = z.object({
  session_id: z.string(),
  device: z.string(),
  browser: z.string(),
  ip: z.string(),
  location: z.string(),
  created_at: z.string(),
  last_seen_at: z.string(),
  current: z.boolean(),
});

export const DeviceSessionsSchema = z.object({ sessions: z.array(DeviceSessionSchema) });
export const RevokedSchema = z.object({ revoked: z.number().int() });
export const ProfileSchema = z.object({ id: z.string(), email: z.string(), name: z.string(), role: z.string(), created_at: z.string().nullable().default(null) });

export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>;
export type DeviceSession = z.infer<typeof DeviceSessionSchema>;
export type MePreferences = z.infer<typeof MePreferencesSchema>;

/** The admin settings router raises `HTTPException(detail={code, message})`,
 *  which is a shorter shape than the Scenario Forge `ErrorEnvelope` that
 *  `client.request` insists on. Collapsing it to ERR_INVALID_ERROR_RESPONSE
 *  would throw away `ADMIN_REQUIRED` / `SETTING_NOT_ALLOWED` /
 *  `SECRET_MANAGER_UNAVAILABLE` — the three things the UI has to say out loud —
 *  so both shapes are accepted here.
 */
const ShortErrorSchema = z.object({ code: z.string(), message: z.string() });

// `z.ZodType<T, ZodTypeDef, unknown>` pins T to the schema's *output*; the
// bare `z.ZodType<T>` form infers the input side, which makes every field with
// a `.default()` look optional to callers.
async function requestSettings<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const candidate = payload && typeof payload === 'object' && 'detail' in payload ? (payload as { detail: unknown }).detail : payload;
    const short = ShortErrorSchema.safeParse(candidate);
    throw new ApiError(response.status, {
      schema_version: '1.0.0',
      failure_class: response.status >= 500 ? 'INFRASTRUCTURE' : 'INPUT_OR_CONTRACT',
      code: short.success ? short.data.code : `HTTP_${response.status}`,
      message: short.success ? short.data.message : `Yêu cầu thất bại (HTTP ${response.status}).`,
      retryable: response.status >= 500,
      correlation_id: 'unknown',
    });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(502, {
      schema_version: '1.0.0', failure_class: 'INFRASTRUCTURE', code: 'ERR_INVALID_SUCCESS_RESPONSE',
      message: 'Máy chủ trả về dữ liệu không đúng định dạng.', retryable: false, correlation_id: 'unknown',
    });
  }
  return parsed.data;
}

export const settingsApi = {
  getPreferences: () => requestSettings('/api/v1/me/preferences', MePreferencesSchema),
  patchPreferences: (patch: UserPreferencesPatch) =>
    requestSettings('/api/v1/me/preferences', MePreferencesSchema, { method: 'PATCH', body: JSON.stringify(patch) }),
  patchProfile: (name: string) =>
    requestSettings('/api/v1/me/profile', ProfileSchema, { method: 'PATCH', body: JSON.stringify({ name }) }),
  listSessions: () => requestSettings('/api/v1/me/sessions', DeviceSessionsSchema),
  revokeSession: (sessionId: string) =>
    requestSettings(`/api/v1/me/sessions/${encodeURIComponent(sessionId)}`, RevokedSchema, { method: 'DELETE' }),
  revokeOtherSessions: () => requestSettings('/api/v1/me/sessions/revoke-all', RevokedSchema, { method: 'POST' }),
  getRuntimeSettings: () => requestSettings('/api/v1/admin/settings', RuntimeSettingsSchema),
  patchRuntimeSettings: (body: Pick<RuntimeSettings, 'provider' | 'model' | 'backend_active_limit_seconds' | 'human_response_limit_seconds'>) =>
    requestSettings('/api/v1/admin/settings/runtime', RuntimeSettingsSchema, { method: 'PATCH', body: JSON.stringify(body) }),
  replaceSecret: (secretName: string) =>
    requestSettings(`/api/v1/admin/settings/secrets/${encodeURIComponent(secretName)}`, z.unknown(), { method: 'POST', body: JSON.stringify({}) }),
};

export type { UserPreferences, UserPreferencesPatch };
