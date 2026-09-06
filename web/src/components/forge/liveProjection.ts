import { UNKNOWN, structuredSpeedRange, structuredSpeedUnits, type FieldGroup, type NumericFieldValue, type Provenance, type StructuredSpeedUnit } from './definitionModel';
import type { ProviderDefinition, ProviderVariant } from '@/shared/api/schemas';

import { translate, type MessageKey } from '@/shared/i18n';
import type { Language } from '@/shared/preferences/types';
import type { TerminologyMap } from '@/shared/api/terminology';
/** Project provider Definition/Variant data onto the field groups the IR editor
 *  already renders. The design is unchanged: same groups, same ids, same
 *  dropdown options — only the values and provenance become real.
 *
 *  A field the provider did not return shows `—` rather than a plausible-looking
 *  default, because presenting an invented value as grounded is exactly the
 *  failure this product is built to avoid.
 */


type Claim = { field: string; value: string; unit?: string | null; source?: string | null };

const numericLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const speedWithOptionalUnit = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:\s+([^\s]+))?$/;
const supportedSpeedUnit = new Set<string>(structuredSpeedUnits);

function isStructuredSpeedInRange(value: number): boolean {
  return value >= structuredSpeedRange.min && value <= structuredSpeedRange.max;
}

export type NumericFieldParseResult =
  | { status: 'valid'; value: NumericFieldValue; displayValue: string }
  | { status: 'unsupported_unit'; displayValue: string }
  | { status: 'invalid_value'; displayValue: string };

export function parseNumericFieldValue(value: unknown, unit?: unknown): NumericFieldParseResult {
  const rawValue = String(value ?? '').trim();
  const explicitUnit = unit === null || unit === undefined ? '' : String(unit).trim();
  const match = speedWithOptionalUnit.exec(rawValue);
  const displayValue = [rawValue, explicitUnit].filter(Boolean).join(' ');
  if (!match) return { status: 'invalid_value', displayValue };
  const inlineUnit = match[2] ?? '';
  if (explicitUnit && inlineUnit && explicitUnit !== inlineUnit) {
    return { status: 'invalid_value', displayValue };
  }
  const selectedUnit = explicitUnit || inlineUnit;
  if (selectedUnit && !supportedSpeedUnit.has(selectedUnit)) {
    return { status: 'unsupported_unit', displayValue };
  }
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return { status: 'invalid_value', displayValue };
  const typedValue: NumericFieldValue = {
    value: numeric,
    unit: (selectedUnit || null) as StructuredSpeedUnit | null,
  };
  return {
    status: 'valid',
    value: typedValue,
    displayValue: `${match[1]}${selectedUnit ? ` ${selectedUnit}` : ''}`,
  };
}

function claim(definition: ProviderDefinition, field: string): Claim | undefined {
  return (definition.claims as unknown as Claim[]).find((item) => item.field === field);
}

function claimValue(definition: ProviderDefinition, field: string): string | null {
  const found = claim(definition, field);
  if (!found) return null;
  return found.unit ? `${found.value} ${found.unit}` : found.value;
}

function provenanceOf(definition: ProviderDefinition, field: string, grounded: boolean): Provenance {
  if (grounded) return 'grounded';
  const found = claim(definition, field);
  if (!found) return 'unknown';
  return found.source === 'user' ? 'user' : 'default';
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Which Structured controls can be written back into the Definition's IR.
 *
 * Only six of the twelve can. Three (`map`, `location`, `conflict`) are read
 * from the *variant's* grounding bindings, so they belong to a build request,
 * not to a Definition; three (`topology`, `mission`, `side`) have no source
 * anywhere and render as UNKNOWN whatever the provider returns. Editing a
 * control that has nowhere to be saved is what made the old Submit silently
 * discard everything, so the ones that cannot travel are marked here and the
 * panel stops offering them.
 */
export const irEditableFields = new Set([
  'global:weather',
  'global:time',
  'global:road_surface',
  'global:visibility',
  'global:approach',
  'relations:location',
  'ego:speed',
  'actors:type',
  'actors:maneuver',
]);

export function isIrEditableField(groupId: string, fieldId: string) {
  return irEditableFields.has(`${groupId}:${fieldId}`);
}

type LogicalIr = {
  actors?: ({ role?: string; type?: string } & Record<string, unknown>)[];
  maneuvers?: ({ actor?: string; action?: string } & Record<string, unknown>)[];
  environment?: Record<string, string>;
  constraints?: ({ actor?: string; field?: string; value?: string } & Record<string, unknown>)[];
};

/**
 * Turns the operator's field edits back into an IR patch, inverting exactly the
 * reads `projectFieldGroups` performs. Values are lower-cased back out of the
 * title case the panel displays, so a round trip returns what the provider sent.
 */
export function buildLogicalIrPatch(
  definition: ProviderDefinition,
  edits: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const ir = (definition.logical_ir ?? {}) as LogicalIr;
  const patch: LogicalIr = {};
  const value = (key: string) => edits[key];

  const weather = value('global:weather');
  const timeOfDay = value('global:time');
  if (weather !== undefined || timeOfDay !== undefined) {
    patch.environment = {
      ...ir.environment,
      ...(weather !== undefined ? { weather: weather.toLowerCase() } : {}),
      ...(timeOfDay !== undefined ? { time_of_day: timeOfDay.toLowerCase() } : {}),
    };
  }

  const controller = value('ego:controller');
  const actorType = value('actors:type');
  if (controller !== undefined || actorType !== undefined) {
    const actors = [...(ir.actors ?? [])];
    const applyTo = (match: (actor: { role?: string }) => boolean, next: string) => {
      const index = actors.findIndex(match);
      if (index >= 0) actors[index] = { ...actors[index], type: next.toLowerCase() };
    };
    if (controller !== undefined) applyTo((actor) => actor.role === 'ego', controller);
    if (actorType !== undefined) applyTo((actor) => actor.role !== 'ego', actorType);
    patch.actors = actors;
  }

  const maneuver = value('actors:maneuver');
  if (maneuver !== undefined && ir.maneuvers?.length) {
    patch.maneuvers = ir.maneuvers.map((item, index) => index === 0 ? { ...item, action: maneuver.toLowerCase() } : item);
  }

  const speed = value('ego:speed');
  if (speed !== undefined) {
    const constraints = [...(ir.constraints ?? [])];
    const index = constraints.findIndex((item) => item.field === 'speed');
    const next = { ...(index >= 0 ? constraints[index] : { actor: 'ego', field: 'speed' }), value: speed };
    if (index >= 0) constraints[index] = next;
    else constraints.push(next);
    patch.constraints = constraints;
  }

  return patch as Record<string, unknown>;
}

export type StructuredDefinitionEdit = { path: string; value: string | number };

/** Convert the display draft into the server's closed list of semantic edits. */
export function buildStructuredDefinitionEdits(
  edits: Readonly<Record<string, string | number>>,
): StructuredDefinitionEdit[] {
  const mappings: Record<string, string> = {
    'global:weather': 'environment.weather',
    'global:time': 'environment.time_of_day',
    'global:road_surface': 'environment.road_surface',
    'global:visibility': 'environment.visibility',
    'global:approach': 'environment.approach',
    'relations:location': 'environment.location',
    'actors:type': 'actors.other.type',
    'actors:maneuver': 'maneuvers.action',
    'ego:speed': 'constraints.speed',
  };
  return Object.entries(edits)
    .filter(([key]) => mappings[key] !== undefined && isIrEditableField(...key.split(':') as [string, string]))
    .flatMap(([key, value]): StructuredDefinitionEdit[] => {
      if (key === 'ego:speed') {
        const draft = String(value).trim();
        if (!numericLiteral.test(draft)) return [];
        const numeric = Number(draft);
        return Number.isFinite(numeric) && isStructuredSpeedInRange(numeric)
          ? [{ path: mappings[key]!, value: numeric }]
          : [];
      }
      const text = String(value).trim();
      return [{
        path: mappings[key]!,
        value: key === 'relations:location' ? text : text.toLowerCase().replaceAll(' ', '_'),
      }];
    });
}


/** IR keys are data, not copy, so unknown ones fall back to their own name
 *  title-cased -- the panel must keep showing a field it has no word for. */
const IR_KEY_LABELS: Record<string, MessageKey> = {
  role: 'ir.key.role', type: 'ir.key.type', approach: 'ir.key.approach', action: 'ir.key.action',
  actor: 'ir.key.actor', field: 'ir.key.field', unit: 'ir.key.unit', subject: 'ir.key.subject',
  value: 'ir.key.value', map: 'ir.key.map', side: 'ir.key.side', speed: 'ir.key.speed',
  distance: 'ir.key.distance', operator: 'ir.key.operator',
};

function irKeyLabel(key: string, language: Language): string {
  const known = IR_KEY_LABELS[key.toLowerCase()];
  return known ? translate(language, known) : titleCase(key.replaceAll('_', ' '));
}

/** The editor and the grounding layer name some fields differently. */
const TERMINOLOGY_FIELDS: Record<string, string> = {
  time: 'time_of_day', type: 'actor', controller: 'actor', conflict: 'location', topology: 'location', side: 'approach',
};

export function projectFieldGroups(
  definition: ProviderDefinition,
  variant: ProviderVariant | null,
  fallback: FieldGroup[],
  language: Language = 'vi',
  terminology: TerminologyMap = {},
): FieldGroup[] {
  const ir = definition.logical_ir as {
    actors?: { role?: string; type?: string }[];
    maneuvers?: { actor?: string; action?: string }[];
    environment?: Record<string, string>;
    constraints?: { actor?: string; field?: string; value?: string }[];
  };
  const bindings = (variant?.bindings ?? null) as { map?: { reference_id?: string }; location?: { reference_id?: string }; region?: { reference_id?: string } } | null;

  // A <select> can only display a value that is one of its options. Falling back
  // to the first option would render a value the provider never returned, so the
  // real value is always inserted into the option list.
  /** The editor used to offer a list compiled into the browser, so a value the
   *  provider added was missing from the dropdown until the next web release.
   *  The published vocabulary wins when it covers the field; the built-in list
   *  is the fallback for fields it does not, and for a provider too old to
   *  publish one. Either way the current value is always offered, because a
   *  field must be able to show what it actually holds.
   */
  const optionsFor = (groupId: string, fieldId: string, value: string) => {
    const published = terminology[TERMINOLOGY_FIELDS[fieldId] ?? fieldId]?.map((option) => option.value);
    const design = published?.length
      ? published
      : fallback.find((group) => group.id === groupId)?.fields.find((field) => field.id === fieldId)?.options;
    if (!design) return value === UNKNOWN ? undefined : [value];
    return design.includes(value) ? design : [value, ...design];
  };

  const mapValue = bindings?.map?.reference_id ?? claimValue(definition, 'map') ?? UNKNOWN;
  const weather = ir.environment?.weather ?? claimValue(definition, 'weather') ?? UNKNOWN;
  const environment = ir.environment ?? {};
  const otherIndex = ir.actors?.findIndex((actor) => actor.role !== 'ego') ?? -1;
  const egoIndex = ir.actors?.findIndex((actor) => actor.role === 'ego') ?? -1;
  const other = otherIndex >= 0 ? ir.actors?.[otherIndex] : undefined;
  const ego = egoIndex >= 0 ? ir.actors?.[egoIndex] : undefined;
  const maneuver = ir.maneuvers?.[0]?.action ?? claimValue(definition, 'maneuver') ?? UNKNOWN;
  const timeOfDay = environment.time_of_day ?? claimValue(definition, 'time_of_day') ?? UNKNOWN;
  const roadSurface = environment.road_surface ?? claimValue(definition, 'road_surface') ?? UNKNOWN;
  const visibility = environment.visibility ?? claimValue(definition, 'visibility') ?? UNKNOWN;
  const approach = environment.approach ?? claimValue(definition, 'approach') ?? UNKNOWN;
  const speedConstraintIndex = ir.constraints?.findIndex((item) => item.field === 'speed' && (
    !item.actor || item.actor === 'ego' || item.actor === ego?.type
  )) ?? -1;
  const speedConstraint = speedConstraintIndex >= 0 ? ir.constraints?.[speedConstraintIndex] : undefined;
  const speedClaim = claim(definition, 'speed');
  const speedSourceValue = speedClaim?.value ?? speedConstraint?.value;
  const speedSourceUnit = speedClaim?.unit;
  const speedIsClaimSourced = Boolean(speedClaim);
  const parsedSpeed = speedSourceValue === undefined
    ? null
    : parseNumericFieldValue(speedSourceValue, speedSourceUnit);
  const egoSpeed = speedSourceValue === undefined
    ? UNKNOWN
    : parsedSpeed?.displayValue || [speedSourceValue, speedSourceUnit].filter(Boolean).join(' ');
  const speedField = {
    id: 'speed',
    label: translate(language, 'ir.field.speed'),
    value: egoSpeed,
    options: optionsFor('ego', 'speed', egoSpeed),
    provenance: provenanceOf(definition, 'speed', false),
    inputType: 'number' as const,
    ...(parsedSpeed?.status === 'valid' && (speedIsClaimSourced || !parsedSpeed.value.unit) ? {
      numericValue: parsedSpeed.value,
      min: structuredSpeedRange.min,
      max: structuredSpeedRange.max,
      unitReadOnlyReason: 'The backend structured edit accepts only a numeric speed; the persisted unit is read-only.',
    } : parsedSpeed?.status === 'valid' ? {
      readOnlyReason: 'This speed unit is stored only in the constraint and cannot be preserved by the numeric-only structured edit contract; the constraint-only speed is read-only.',
    } : parsedSpeed ? {
      readOnlyReason: parsedSpeed.status === 'unsupported_unit'
        ? 'Unsupported speed unit. Supported units are m/s, km/h, and mph; the value is read-only until the provider supplies one of these units.'
        : 'Invalid persisted speed value; the value is read-only until the provider supplies a finite number.',
    } : {}),
  };

  const groups: FieldGroup[] = [
    {
      id: 'global',
      title: translate(language, 'ir.group.global'),
      fields: [
        { id: 'map', label: translate(language, 'ir.field.map'), value: mapValue, options: optionsFor('global', 'map', mapValue), provenance: provenanceOf(definition, 'map', Boolean(bindings?.map)) },
        { id: 'weather', label: translate(language, 'ir.field.weather'), value: weather === UNKNOWN ? UNKNOWN : titleCase(weather), options: optionsFor('global', 'weather', weather === UNKNOWN ? UNKNOWN : titleCase(weather)), provenance: provenanceOf(definition, 'weather', false) },
        { id: 'time', label: translate(language, 'ir.field.time'), value: timeOfDay === UNKNOWN ? UNKNOWN : titleCase(timeOfDay), options: optionsFor('global', 'time', timeOfDay === UNKNOWN ? UNKNOWN : titleCase(timeOfDay)), provenance: provenanceOf(definition, 'time_of_day', false) },
        { id: 'road_surface', label: translate(language, 'ir.field.road_surface'), value: roadSurface === UNKNOWN ? UNKNOWN : titleCase(roadSurface), options: optionsFor('global', 'road_surface', roadSurface === UNKNOWN ? UNKNOWN : titleCase(roadSurface)), provenance: provenanceOf(definition, 'road_surface', false) },
        { id: 'visibility', label: translate(language, 'ir.field.visibility'), value: visibility === UNKNOWN ? UNKNOWN : titleCase(visibility), options: optionsFor('global', 'visibility', visibility === UNKNOWN ? UNKNOWN : titleCase(visibility)), provenance: provenanceOf(definition, 'visibility', false) },
        { id: 'approach', label: translate(language, 'ir.field.approach'), value: approach === UNKNOWN ? UNKNOWN : titleCase(approach), options: optionsFor('global', 'approach', approach === UNKNOWN ? UNKNOWN : titleCase(approach)), provenance: provenanceOf(definition, 'approach', false) },
      ],
    },
    {
      id: 'relations',
      title: translate(language, 'ir.group.relations'),
      fields: [
        { id: 'topology', label: translate(language, 'ir.field.topology'), value: UNKNOWN, options: optionsFor('relations', 'topology', UNKNOWN), provenance: 'unknown' },
        { id: 'location', label: translate(language, 'ir.field.location'), value: bindings?.location?.reference_id ?? environment.location ?? claimValue(definition, 'location') ?? UNKNOWN, options: optionsFor('relations', 'location', bindings?.location?.reference_id ?? environment.location ?? claimValue(definition, 'location') ?? UNKNOWN), provenance: bindings?.location ? 'grounded' : provenanceOf(definition, 'location', false), inputType: bindings?.location ? undefined : 'text' },
        { id: 'conflict', label: translate(language, 'ir.field.conflict'), value: bindings?.region?.reference_id ?? UNKNOWN, options: optionsFor('relations', 'conflict', bindings?.region?.reference_id ?? UNKNOWN), provenance: bindings?.region ? 'grounded' : 'unknown' },
      ],
    },
    {
      id: 'ego',
      title: translate(language, 'ir.group.ego'),
      fields: [
        speedField,
        { id: 'mission', label: translate(language, 'ir.field.mission'), value: UNKNOWN, options: optionsFor('ego', 'mission', UNKNOWN), provenance: 'unknown' },
        { id: 'controller', label: translate(language, 'ir.field.controller'), value: ego?.type ? titleCase(ego.type) : UNKNOWN, options: optionsFor('ego', 'controller', ego?.type ? titleCase(ego.type) : UNKNOWN), provenance: ego ? 'user' : 'unknown' },
      ],
    },
    {
      id: 'actors',
      title: translate(language, 'ir.group.actors'),
      fields: [
        { id: 'role', label: translate(language, 'ir.field.role'), value: other?.role ? titleCase(other.role) : UNKNOWN, options: optionsFor('actors', 'type', other?.role ? titleCase(other.role) : UNKNOWN), provenance: other?.role ? 'user' : 'unknown' },
        { id: 'side', label: translate(language, 'ir.field.side'), value: UNKNOWN, options: optionsFor('actors', 'side', UNKNOWN), provenance: 'unknown' },
        { id: 'type', label: translate(language, 'ir.field.type'), value: other?.type ? titleCase(other.type) : UNKNOWN, options: optionsFor('actors', 'type', other?.type ? titleCase(other.type) : UNKNOWN), provenance: other ? 'user' : 'unknown' },
        { id: 'maneuver', label: translate(language, 'ir.field.maneuver'), value: maneuver === UNKNOWN ? UNKNOWN : titleCase(maneuver), options: optionsFor('actors', 'maneuver', maneuver === UNKNOWN ? UNKNOWN : titleCase(maneuver)), provenance: provenanceOf(definition, 'maneuver', false) },
      ],
    },
  ];

  const knownClaimFields = new Set([
    'map', 'weather', 'time_of_day', 'road_surface', 'visibility', 'approach',
    'location', 'speed', 'maneuver', 'role', 'type',
  ]);
  const additional: FieldGroup['fields'] = [];
  const addLeaf = (id: string, label: string, value: unknown) => {
    if (value === null || value === undefined) return;
    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    if (!rendered) return;
    additional.push({
      id: `ir-${id}`,
      label,
      value: rendered,
      provenance: 'unknown',
      readOnlyReason: 'Provider supplied this authoring value; it is not editable through the closed Structured contract.',
    });
  };
  const walk = (value: unknown, path: string, label: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}-${index}`, `${label} ${index + 1}`));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const nextLabel = `${label} · ${titleCase(key.replaceAll('_', ' '))}`;
        walk(item, `${path}-${key}`, nextLabel);
      });
      return;
    }
    addLeaf(path, label, value);
  };
  // The fixed controls above are the editable UX projection. This deterministic
  // supplemental group preserves every extra actor/maneuver/constraint,
  // environment leaf, and unmatched claim without inventing edit affordances.
  (ir.actors ?? []).forEach((actor, index) => {
    const represented = new Set<string>();
    if (index === egoIndex) represented.add('type');
    if (index === otherIndex) represented.add('role').add('type');
    Object.entries(actor).filter(([key]) => !represented.has(key)).forEach(([key, value]) => {
      walk(value, `actor-${index + 1}-${key}`, `${translate(language, 'ir.prefix.actor', { n: index + 1 })} · ${irKeyLabel(key, language)}`);
    });
  });
  (ir.maneuvers ?? []).forEach((maneuverItem, index) => {
    const represented = index === 0 ? new Set(['action']) : new Set<string>();
    Object.entries(maneuverItem).filter(([key]) => !represented.has(key)).forEach(([key, value]) => {
      walk(value, `maneuver-${index + 1}-${key}`, `${translate(language, 'ir.prefix.maneuver', { n: index + 1 })} · ${irKeyLabel(key, language)}`);
    });
  });
  (ir.constraints ?? []).forEach((constraint, index) => {
    const represented = index === speedConstraintIndex ? new Set(['value']) : new Set<string>();
    Object.entries(constraint).filter(([key]) => !represented.has(key)).forEach(([key, value]) => {
      walk(value, `constraint-${index + 1}-${key}`, `${translate(language, 'ir.prefix.constraint', { n: index + 1 })} · ${irKeyLabel(key, language)}`);
    });
  });
  const representedEnvironment = new Set(['weather', 'time_of_day', 'road_surface', 'visibility', 'approach', 'location']);
  Object.entries(environment).filter(([key]) => !representedEnvironment.has(key)).forEach(([key, value]) => addLeaf(`environment-${key}`, `${translate(language, 'ir.prefix.environment')} · ${irKeyLabel(key, language)}`, value));
  (definition.claims as unknown as Claim[])
    .filter((item) => !knownClaimFields.has(item.field))
    .forEach((item, index) => addLeaf(`claim-${index + 1}-${item.field}`, `${translate(language, 'ir.prefix.claim')} · ${irKeyLabel(item.field, language)}`, item.unit ? `${item.value} ${item.unit}` : item.value));
  if (additional.length > 0) groups.push({ id: 'additional', title: translate(language, 'ir.group.additional'), fields: additional });
  return groups;
}
