import { z } from 'zod';

/** Preferences are grouped so a change PATCHes one group rather than the whole
 *  document; two settings edited from different tabs then cannot clobber each
 *  other's unrelated groups.
 */

export const ThemeChoiceSchema = z.enum(['light', 'dark', 'system']);
export const DensitySchema = z.enum(['comfortable', 'compact']);
export const FontScaleSchema = z.enum(['sm', 'md', 'lg']);
export const MotionChoiceSchema = z.enum(['system', 'reduce', 'full']);

export const AppearanceSchema = z.object({
  theme: ThemeChoiceSchema,
  density: DensitySchema,
  fontScale: FontScaleSchema,
  motion: MotionChoiceSchema,
});

export const LanguageSchema = z.enum(['vi', 'en']);
export const DateFormatSchema = z.enum(['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy']);
export const TimeFormatSchema = z.enum(['24h', '12h']);

export const LocaleSchema = z.object({
  language: LanguageSchema,
  timeZone: z.string().min(1),
  dateFormat: DateFormatSchema,
  timeFormat: TimeFormatSchema,
});

export const ChannelSchema = z.object({ inApp: z.boolean(), email: z.boolean() });
export const DigestSchema = z.enum(['off', 'daily', 'weekly']);

export const NotificationsSchema = z.object({
  runCompleted: ChannelSchema,
  runFailed: ChannelSchema,
  reviewRequested: ChannelSchema,
  budgetWarning: ChannelSchema,
  digest: DigestSchema,
  sound: z.boolean(),
});

export const SeedModeSchema = z.enum(['fixed', 'random']);

export const RunDefaultsSchema = z.object({
  defaultSeed: z.string().regex(/^\d*$/),
  seedMode: SeedModeSchema,
  autoOpenCanvas: z.boolean(),
  streamReasoning: z.boolean(),
  confirmBeforeRun: z.boolean(),
});

export const UserPreferencesSchema = z.object({
  appearance: AppearanceSchema,
  locale: LocaleSchema,
  notifications: NotificationsSchema,
  run: RunDefaultsSchema,
});

export const UserPreferencesPatchSchema = z.object({
  appearance: AppearanceSchema.partial().optional(),
  locale: LocaleSchema.partial().optional(),
  notifications: NotificationsSchema.partial().optional(),
  run: RunDefaultsSchema.partial().optional(),
});

export type ThemeChoice = z.infer<typeof ThemeChoiceSchema>;
export type Density = z.infer<typeof DensitySchema>;
export type FontScale = z.infer<typeof FontScaleSchema>;
export type MotionChoice = z.infer<typeof MotionChoiceSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type DateFormat = z.infer<typeof DateFormatSchema>;
export type TimeFormat = z.infer<typeof TimeFormatSchema>;
export type Digest = z.infer<typeof DigestSchema>;
export type SeedMode = z.infer<typeof SeedModeSchema>;
export type NotificationEvent = 'runCompleted' | 'runFailed' | 'reviewRequested' | 'budgetWarning';
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type PreferenceGroup = keyof UserPreferences;
export type UserPreferencesPatch = z.infer<typeof UserPreferencesPatchSchema>;

/** The default theme is `light`, not `system`: the light palette is the
 *  reviewed baseline, so dark is something a user opts into rather than
 *  something a machine's OS setting silently applies to an approved design.
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  appearance: { theme: 'light', density: 'comfortable', fontScale: 'md', motion: 'system' },
  locale: { language: 'vi', timeZone: 'Asia/Ho_Chi_Minh', dateFormat: 'dd/MM/yyyy', timeFormat: '24h' },
  notifications: {
    runCompleted: { inApp: true, email: false },
    runFailed: { inApp: true, email: true },
    reviewRequested: { inApp: true, email: true },
    budgetWarning: { inApp: true, email: false },
    digest: 'off',
    sound: false,
  },
  run: { defaultSeed: '42', seedMode: 'fixed', autoOpenCanvas: true, streamReasoning: true, confirmBeforeRun: false },
};

/** Merges one level deeper than `Object.assign` so a patch touching a single
 *  key inside a group keeps that group's other keys.
 */
export function mergePreferences(base: UserPreferences, patch: UserPreferencesPatch): UserPreferences {
  return {
    appearance: { ...base.appearance, ...patch.appearance },
    locale: { ...base.locale, ...patch.locale },
    notifications: { ...base.notifications, ...patch.notifications },
    run: { ...base.run, ...patch.run },
  };
}

/** Stored preferences are user-writable and may predate a field,
 *  so parsing falls back per group rather than discarding the whole document.
 */
export function coercePreferences(value: unknown): UserPreferences {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const groups = [
    ['appearance', AppearanceSchema],
    ['locale', LocaleSchema],
    ['notifications', NotificationsSchema],
    ['run', RunDefaultsSchema],
  ] as const;
  const result = { ...DEFAULT_PREFERENCES };
  for (const [key, schema] of groups) {
    const parsed = schema.safeParse({ ...DEFAULT_PREFERENCES[key] as object, ...(source[key] as object ?? {}) });
    if (parsed.success) Object.assign(result, { [key]: parsed.data });
  }
  return result;
}
