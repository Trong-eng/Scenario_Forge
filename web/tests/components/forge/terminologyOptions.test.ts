import { describe, expect, it } from 'vitest';
import { projectFieldGroups } from '../../../src/components/forge/liveProjection';
import { fieldGroupTemplate } from '../../../src/components/forge/definitionModel';
import type { TerminologyMap } from '../../../src/shared/api/terminology';

const definition = {
  request_id: 'req', job_id: null, job_status: null, correlation_id: 'corr',
  definition_version_id: 'dv', supersedes: null,
  definition: { schema_version: '1.0.0', project_id: 'p', definition_id: 'd', version: 1, description: '', content_hash: 'sha256:x' },
  claims: [], logical_ir: { environment: { weather: 'clear' }, actors: [], maneuvers: [], constraints: [] }, provenance: {},
} as never;

const optionsOf = (fieldId: string, terminology: TerminologyMap) =>
  projectFieldGroups(definition, null, fieldGroupTemplate, 'vi', terminology)
    .flatMap((group) => group.fields)
    .find((field) => field.id === fieldId)?.options;

/** The dropdown used to offer a list compiled into the browser, so a value the
 *  provider added was invisible until the next web release. */
describe('options the provider publishes', () => {
  it('offers a value this build has never heard of', () => {
    const published: TerminologyMap = {
      weather: [
        { value: 'clear', label_key: 'catalog.weather.clear' },
        { value: 'heavy_rain', label_key: 'catalog.weather.heavy_rain' },
        { value: 'blizzard', label_key: 'catalog.weather.blizzard' },
      ],
    };

    expect(optionsOf('weather', published)).toEqual(['Clear', 'clear', 'heavy_rain', 'blizzard']);
  });

  it('falls back to the built-in list for a field the provider does not publish', () => {
    const builtIn = fieldGroupTemplate.find((g) => g.id === 'global')?.fields.find((f) => f.id === 'visibility')?.options;

    // A provider too old to publish a vocabulary must not empty the editor.
    // The unset value leads, as it always has, so the field can show what it holds.
    expect(optionsOf('visibility', {})).toEqual(['—', ...(builtIn ?? [])]);
  });

  it('resolves the field names the two layers spell differently', () => {
    const published: TerminologyMap = { time_of_day: [{ value: 'dusk', label_key: 'catalog.time_of_day.dusk' }] };

    // The editor calls it `time`; grounding calls it `time_of_day`.
    expect(optionsOf('time', published)).toContain('dusk');
  });

  it('always offers the value the Definition actually holds', () => {
    // Even a value the published vocabulary omits: the field has to be able to
    // show what it is currently set to.
    const published: TerminologyMap = { weather: [{ value: 'rain', label_key: 'catalog.weather.rain' }] };

    expect(optionsOf('weather', published)?.[0]).toBe('Clear');
  });
});
