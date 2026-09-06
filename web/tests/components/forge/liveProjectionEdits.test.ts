import { describe, expect, it } from 'vitest';
import { buildLogicalIrPatch, buildStructuredDefinitionEdits, isIrEditableField, projectFieldGroups } from '../../../src/components/forge/liveProjection';
import type { ProviderDefinition } from '../../../src/shared/api/schemas';

const definition = {
  request_id: 'req', job_id: null, job_status: null, correlation_id: 'corr',
  definition_version_id: 'dv-1', supersedes: null, archived: false, archived_at: null,
  definition: { schema_version: '1.0.0', project_id: 'p', definition_id: 'def-1', version: 1, description: 'ego brakes', content_hash: 'sha256:one' },
  claims: [],
  logical_ir: {
    actors: [{ role: 'ego', type: 'car' }, { role: 'other', type: 'pedestrian' }],
    maneuvers: [{ actor: 'other', action: 'cross' }],
    environment: { weather: 'clear', time_of_day: 'daytime' },
    constraints: [{ actor: 'ego', field: 'speed', value: '8' }],
  },
  provenance: {},
} as unknown as ProviderDefinition;

describe('writing Structured edits back into the IR', () => {
  it('inverts exactly the reads the panel performs', () => {
    const patch = buildLogicalIrPatch(definition, {
      'global:weather': 'Cloudy',
      'ego:speed': '12',
      'actors:maneuver': 'Turn left',
      'ego:controller': 'Vehicle',
    });

    // The panel title-cases what it displays, so the patch lower-cases it back:
    // a round trip has to return the vocabulary the provider sent.
    expect(patch).toMatchObject({
      environment: { weather: 'cloudy', time_of_day: 'daytime' },
      maneuvers: [{ actor: 'other', action: 'turn left' }],
      constraints: [{ actor: 'ego', field: 'speed', value: '12' }],
    });
    // Only the ego actor's type moved; the other actor is untouched.
    expect((patch as { actors: { role?: string; type?: string }[] }).actors).toEqual([
      { role: 'ego', type: 'vehicle' },
      { role: 'other', type: 'pedestrian' },
    ]);
  });

  it('carries only the fields that were edited', () => {
    expect(buildLogicalIrPatch(definition, {})).toEqual({});
    expect(Object.keys(buildLogicalIrPatch(definition, { 'global:time': 'Night' }))).toEqual(['environment']);
  });

  it('adds a speed constraint when the Definition carries none', () => {
    const bare = { ...definition, logical_ir: { ...definition.logical_ir, constraints: [] } } as unknown as ProviderDefinition;
    expect(buildLogicalIrPatch(bare, { 'ego:speed': '15' })).toMatchObject({
      constraints: [{ actor: 'ego', field: 'speed', value: '15' }],
    });
  });

  it('names the controls that have nowhere to be saved', () => {
    // Grounding bindings belong to a build request, not to a Definition, and
    // three more fields have no source at all -- the panel must not offer them.
    for (const field of ['global:weather', 'global:time', 'ego:speed', 'actors:type', 'actors:maneuver']) {
      const [group, id] = field.split(':');
      expect(isIrEditableField(group!, id!)).toBe(true);
    }
    for (const field of ['global:map', 'relations:conflict', 'relations:topology', 'ego:mission', 'actors:role', 'actors:side']) {
      const [group, id] = field.split(':');
      expect(isIrEditableField(group!, id!)).toBe(false);
    }
  });

  it('covers every field the panel renders', () => {
    const rendered = projectFieldGroups(definition, null, []).flatMap((group) => group.fields.map((field) => `${group.id}:${field.id}`));
    // The complete authoring projection has explicit read-only and editable
    // fields; a new field must come with an explicit server-path decision.
    expect(rendered.length).toBeGreaterThan(12);
    expect(rendered.filter((key) => isIrEditableField(...key.split(':') as [string, string]))).toHaveLength(9);
  });

  it('retains every additional actor, maneuver, constraint, environment leaf, and unmatched claim', () => {
    const expanded = {
      ...definition,
      claims: [...definition.claims, { field: 'custom_fact', value: 'verified', source: 'user' }],
      logical_ir: {
        ...definition.logical_ir,
        actors: [...(definition.logical_ir.actors as unknown[]), { role: 'bystander', type: 'cyclist', id: 'a3' }],
        maneuvers: [...(definition.logical_ir.maneuvers as unknown[]), { actor: 'bystander', action: 'stop', trigger: 'horn' }],
        environment: { ...(definition.logical_ir.environment as Record<string, string>), temperature: 'cold' },
        constraints: [...(definition.logical_ir.constraints as unknown[]), { actor: 'other', field: 'distance', value: '5m' }],
      },
    } as unknown as ProviderDefinition;
    const additional = projectFieldGroups(expanded, null, []).find((group) => group.id === 'additional');
    const values = additional?.fields.map((field) => field.value) ?? [];
    expect(values).toEqual(expect.arrayContaining(['ego', 'bystander', 'cyclist', 'a3', 'other', 'stop', 'horn', 'ego', 'speed', 'other', 'distance', '5m', 'cold', 'verified']));
    expect(additional?.fields.every((field) => field.readOnlyReason)).toBe(true);
  });

  it('preserves reordered actors, actor-specific speeds, and duplicate claims distinctly', () => {
    const reordered = {
      ...definition,
      claims: [
        { field: 'actor', value: 'pedestrian', source: 'user' },
        { field: 'actor', value: 'cyclist', source: 'user' },
        { field: 'speed', value: '12', unit: 'm/s', source: 'user' },
        { field: 'speed', value: '8', unit: 'm/s', source: 'user' },
        { field: 'custom_fact', value: 'first', source: 'user' },
        { field: 'custom_fact', value: 'second', source: 'user' },
      ],
      logical_ir: {
        actors: [
          { role: 'other', type: 'pedestrian', id: 'ped-1' },
          { role: 'ego', type: 'car', id: 'ego-1' },
          { role: 'other', type: 'cyclist', id: 'cyc-1' },
        ],
        maneuvers: [
          { actor: 'cyclist', action: 'crossing' },
          { actor: 'pedestrian', action: 'stop' },
        ],
        environment: { weather: 'clear', temperature: 'cold' },
        constraints: [
          { actor: 'cyclist', field: 'speed', value: '8' },
          { actor: 'ego', field: 'speed', value: '12' },
        ],
      },
    } as unknown as ProviderDefinition;
    const additional = projectFieldGroups(reordered, null, []).find((group) => group.id === 'additional');
    const fields = additional?.fields ?? [];
    expect(fields.map((field) => field.value)).toEqual(expect.arrayContaining([
      'ped-1', 'ego', 'ego-1', 'cyclist', 'cyc-1', 'cyclist', '8',
      'stop', 'cold', 'first', 'second',
    ]));
    expect(fields.filter((field) => field.value === 'first' || field.value === 'second')).toHaveLength(2);
  });

  it('falls back to persisted claims, including units, when IR leaves are absent', () => {
    const sparse = {
      ...definition,
      claims: [
        { field: 'time_of_day', value: 'nighttime', source: 'user' },
        { field: 'road_surface', value: 'wet', source: 'user' },
        { field: 'visibility', value: 'poor', source: 'user' },
        { field: 'approach', value: 'left', source: 'user' },
        { field: 'speed', value: '15', unit: 'm/s', source: 'user' },
      ],
      logical_ir: {
        actors: [{ role: 'ego', type: 'car' }, { role: 'other', type: 'pedestrian' }],
        maneuvers: [], environment: { weather: 'clear' }, constraints: [],
      },
    } as unknown as ProviderDefinition;
    const groups = projectFieldGroups(sparse, null, []);
    const value = (group: string, field: string) => groups.find((item) => item.id === group)?.fields.find((item) => item.id === field)?.value;

    expect(value('global', 'time')).toBe('Nighttime');
    expect(value('global', 'road_surface')).toBe('Wet');
    expect(value('global', 'visibility')).toBe('Poor');
    expect(value('global', 'approach')).toBe('Left');
    expect(value('ego', 'speed')).toBe('15 m/s');
  });

  it('projects a persisted speed claim into separate numeric and unit values', () => {
    const withSpeedClaim = {
      ...definition,
      claims: [{ field: 'speed', value: '10', unit: 'm/s', source: 'user' }],
    } as unknown as ProviderDefinition;
    const speed = projectFieldGroups(withSpeedClaim, null, [])
      .find((group) => group.id === 'ego')?.fields.find((field) => field.id === 'speed');

    expect(speed).toMatchObject({
      value: '10 m/s',
      numericValue: { value: 10, unit: 'm/s' },
      inputType: 'number',
    });
    expect(speed?.unitReadOnlyReason).toContain('unit');
  });

  it('makes a unit-bearing constraint-only speed read-only to prevent silent unit loss', () => {
    const withSpeedConstraint = {
      ...definition,
      claims: [],
      logical_ir: {
        ...definition.logical_ir,
        constraints: [{ actor: 'ego', field: 'speed', value: '10 m/s' }],
      },
    } as unknown as ProviderDefinition;
    const speed = projectFieldGroups(withSpeedConstraint, null, [])
      .find((group) => group.id === 'ego')?.fields.find((field) => field.id === 'speed');

    expect(speed?.numericValue).toBeUndefined();
    expect(speed?.value).toBe('10 m/s');
    expect(speed?.readOnlyReason).toContain('constraint');
    expect(speed?.readOnlyReason).toContain('unit');
  });

  it('preserves a constraint-only source unit across the successor projection', () => {
    const source = {
      ...definition,
      claims: [],
      logical_ir: {
        ...definition.logical_ir,
        constraints: [{ actor: 'ego', field: 'speed', value: '10 m/s' }],
      },
    } as unknown as ProviderDefinition;
    const successor = {
      ...source,
      logical_ir: {
        ...source.logical_ir,
        constraints: [{ actor: 'ego', field: 'speed', value: '12 m/s' }],
      },
    } as unknown as ProviderDefinition;

    const sourceSpeed = projectFieldGroups(source, null, [])
      .find((group) => group.id === 'ego')?.fields.find((field) => field.id === 'speed');
    const successorSpeed = projectFieldGroups(successor, null, [])
      .find((group) => group.id === 'ego')?.fields.find((field) => field.id === 'speed');

    expect(sourceSpeed?.value).toBe('10 m/s');
    expect(successorSpeed?.value).toBe('12 m/s');
    expect(successorSpeed?.readOnlyReason).toBe(sourceSpeed?.readOnlyReason);
  });

  it('maps a numeric speed edit to a finite number and rejects display or invalid values', () => {
    expect(buildStructuredDefinitionEdits({ 'ego:speed': '12' })).toEqual([
      { path: 'constraints.speed', value: 12 },
    ]);
    expect(buildStructuredDefinitionEdits({ 'ego:speed': '10 m/s' })).toEqual([]);
    expect(buildStructuredDefinitionEdits({ 'ego:speed': 'NaN' })).toEqual([]);
    expect(buildStructuredDefinitionEdits({ 'ego:speed': 'Infinity' })).toEqual([]);
    expect(buildStructuredDefinitionEdits({ 'ego:speed': '0' })).toEqual([
      { path: 'constraints.speed', value: 0 },
    ]);
    expect(buildStructuredDefinitionEdits({ 'ego:speed': '300' })).toEqual([
      { path: 'constraints.speed', value: 300 },
    ]);
    expect(buildStructuredDefinitionEdits({ 'ego:speed': '-1' })).toEqual([]);
    expect(buildStructuredDefinitionEdits({ 'ego:speed': '301' })).toEqual([]);
  });

  it('makes an unsupported speed unit read-only with an explicit reason', () => {
    const unsupported = {
      ...definition,
      claims: [{ field: 'speed', value: '10', unit: 'knots', source: 'user' }],
    } as unknown as ProviderDefinition;
    const speed = projectFieldGroups(unsupported, null, [])
      .find((group) => group.id === 'ego')?.fields.find((field) => field.id === 'speed');

    expect(speed?.value).toBe('10 knots');
    expect(speed?.numericValue).toBeUndefined();
    expect(speed?.readOnlyReason).toContain('m/s');
    expect(speed?.readOnlyReason).toContain('km/h');
    expect(speed?.readOnlyReason).toContain('mph');
  });

  it('does not repeat fixed fields in supplemental rows after actor reordering', () => {
    const reordered = {
      ...definition,
      logical_ir: {
        actors: [{ role: 'other', type: 'pedestrian', id: 'ped-1' }, { role: 'ego', type: 'car', id: 'ego-1' }],
        maneuvers: [{ actor: 'pedestrian', action: 'crossing' }],
        environment: { weather: 'clear', time_of_day: 'daytime', extra: 'cold' },
        constraints: [{ actor: 'ego', field: 'speed', value: '8' }],
      },
    } as unknown as ProviderDefinition;
    const additional = projectFieldGroups(reordered, null, []).find((group) => group.id === 'additional');
    const labels = additional?.fields.map((field) => field.label) ?? [];

    expect(labels).not.toContain('Đối tượng 2 · Type');
    expect(labels).not.toContain('Actor 1 · Role');
    expect(labels).not.toContain('Hành vi 1 · Action');
    expect(labels).not.toContain('Môi trường · Weather');
    expect(labels).toContain('Đối tượng 1 · Id');
    expect(labels).toContain('Đối tượng 2 · Id');
    expect(labels).toContain('Môi trường · Extra');
  });
});
