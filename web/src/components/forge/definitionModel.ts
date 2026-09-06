/** The shape of the IR editor, with no scenario data in it.
 *
 *  This file replaces the former `data.ts`, which shipped a complete invented
 *  scenario -- a Town05 motorcycle crossing in rain, a PASS verdict, a Scenic
 *  program -- and rendered it whenever real data had not arrived yet. A user
 *  could not tell those values from a provider's, which is the exact failure
 *  this product exists to prevent.
 *
 *  What survives is the part that is genuinely design, not data: which groups
 *  and fields the editor shows, and which choices each dropdown offers. Every
 *  value is UNKNOWN until a provider supplies one.
 */

export type Provenance = 'grounded' | 'user' | 'default' | 'unknown';

export const structuredSpeedUnits = ['m/s', 'km/h', 'mph'] as const;
export type StructuredSpeedUnit = typeof structuredSpeedUnits[number];
export const structuredSpeedRange = { min: 0, max: 300 } as const;

/** Numeric controls keep the transport value separate from its display unit. */
export type NumericFieldValue = {
  value: number;
  unit: StructuredSpeedUnit | null;
};

export type Field = {
  id: string;
  label: string;
  note?: string;
  value: string;
  options?: string[];
  provenance: Provenance;
  /** Set when the value has nowhere to be saved, with the reason to show. */
  readOnlyReason?: string;
  /** A unit control can be visible but immutable while the number remains editable. */
  unitReadOnlyReason?: string;
  numericValue?: NumericFieldValue;
  numericDraft?: string;
  validationMessage?: string;
  min?: number;
  max?: number;
  inputType?: 'text' | 'number';
};

export type FieldGroup = {
  id: string;
  title: string;
  fields: Field[];
};

export type DefinitionTab = 'structured' | 'diff';

/** Shown in place of a value the provider did not return. */
export const UNKNOWN = '—';

const field = (id: string, label: string, options?: string[]): Field => ({
  id,
  label,
  value: UNKNOWN,
  options,
  provenance: 'unknown',
});

/** Group ids match what `projectFieldGroups` emits, so the projection can find
 *  each field's options. They diverged once (`actor` here, `actors` there) and
 *  every dropdown in that group silently lost its choices. */
export const fieldGroupTemplate: FieldGroup[] = [
  {
    id: 'global',
    title: 'Global',
    fields: [
      field('map', 'Map', ['Town01', 'Town03', 'Town05', 'Town05_Opt', 'Town10HD']),
      field('weather', 'Weather', ['Clear', 'Cloudy', 'Rain', 'Heavy rain', 'Fog', 'Snow']),
      field('time', 'Time of day', ['Dawn', 'Daytime', 'Dusk', 'Nighttime']),
      field('road_surface', 'Road surface', ['Dry', 'Wet', 'Icy']),
      field('visibility', 'Visibility', ['Clear', 'Poor', 'Fog']),
      field('approach', 'Approach', ['Left', 'Right', 'Front', 'Rear']),
    ],
  },
  {
    id: 'relations',
    title: 'Relations',
    fields: [
      field('topology', 'Topology', ['Four-way intersection', 'T-junction', 'Roundabout', 'Straight road']),
      field('location', 'Location'),
      field('conflict', 'Conflict region'),
    ],
  },
  {
    id: 'ego',
    title: 'Ego',
    fields: [
      field('speed', 'Initial speed'),
      field('mission', 'Mission', ['Go straight', 'Turn left', 'Turn right']),
      field('controller', 'Controller', ['Scripted', 'Autopilot', 'Replay']),
    ],
  },
  {
    id: 'actors',
    title: 'Other actors',
    fields: [
      field('side', 'Side', ['Left', 'Right']),
      field('type', 'Actor type', ['Motorcycle', 'Bicycle', 'Car', 'Pedestrian']),
      field('maneuver', 'Maneuver'),
    ],
  },
];
