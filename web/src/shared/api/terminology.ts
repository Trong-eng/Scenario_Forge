import { z } from 'zod';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';

/** Mirrors `TerminologyView` in `src/models/scenario_forge/terminology.py`. */
export const TerminologyOptionSchema = z.object({ value: z.string(), label_key: z.string() });
export const TerminologyFieldSchema = z.object({ field: z.string(), options: z.array(TerminologyOptionSchema) });
export const TerminologySchema = z.object({ schema_version: z.string(), fields: z.array(TerminologyFieldSchema) });

export type TerminologyOption = z.infer<typeof TerminologyOptionSchema>;
/** field -> its allowed options, in the order the provider published them. */
export type TerminologyMap = Record<string, TerminologyOption[]>;

/** The vocabulary is a released constant, so one fetch per page load is enough
 *  and every caller can share it. A failure is not an error state: the editor
 *  keeps its built-in list, which is what it used before this endpoint existed.
 */
let inFlight: Promise<TerminologyMap> | null = null;

export function fetchTerminology(): Promise<TerminologyMap> {
  inFlight ??= fetch(`${apiBaseUrl}/api/v1/scenario-forge/terminology`, { credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) return {};
      const parsed = TerminologySchema.safeParse(await response.json());
      if (!parsed.success) return {};
      return Object.fromEntries(parsed.data.fields.map((item) => [item.field, item.options]));
    })
    .catch(() => ({}));
  return inFlight;
}

/** Test seam: the cache is per page load, and a test is not one. */
export function resetTerminologyCache() {
  inFlight = null;
}
