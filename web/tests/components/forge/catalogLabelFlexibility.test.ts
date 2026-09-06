import { describe, expect, it } from 'vitest';
import { clarificationChoiceLabel, clarificationValueLabel } from '../../../src/components/forge/clarificationLabels';

/** The provider owns its catalog, and it grows. These cases pin what happens to
 *  a value this codebase has never seen -- the case a fixed table gets wrong.
 */
describe('a value the table has never met', () => {
  it('composes one it can compose, in the right word order', () => {
    // Nothing lists `heavy_rain`; both of its tokens are known, so it reads.
    expect(clarificationValueLabel('weather', 'heavy_rain', 'vi')).toBe('Mưa lớn');
    expect(clarificationValueLabel('weather', 'light_fog', 'vi')).toBe('Sương mù nhẹ');
    expect(clarificationValueLabel('road_surface', 'wet_lane', 'vi')).toBe('Làn ướt');

    // Vietnamese puts the thing first and its qualifier after; English does not.
    expect(clarificationValueLabel('weather', 'heavy_rain', 'en')).toBe('Heavy rain');
  });

  it('composes a bare token too', () => {
    expect(clarificationValueLabel('weather', 'snow', 'vi')).toBe('Tuyết');
    expect(clarificationValueLabel('maneuver', 'overtake', 'vi')).toBe('Vượt');
  });

  it('shows the identifier untouched rather than inventing a translation', () => {
    // `drizzle` is in no vocabulary here. Guessing would put invented text
    // beside a real catalog value.
    expect(clarificationValueLabel('weather', 'drizzle', 'vi')).toBe('Drizzle');
    expect(clarificationValueLabel('weather', 'heavy_drizzle', 'vi')).toBe('Heavy drizzle');
    // A map id is an identifier, not a word, and must survive as one.
    expect(clarificationValueLabel('map', 'Town03', 'vi')).toBe('Town03');
  });

  it('declines to compose a phrase it cannot order correctly', () => {
    // Three tokens would need grammar this table has no business guessing at.
    expect(clarificationValueLabel('weather', 'very_heavy_rain', 'vi')).toBe('Very heavy rain');
  });
});

describe('a label the provider supplied', () => {
  it('outranks every table in this file', () => {
    expect(clarificationChoiceLabel('weather', 'Trời quang mây tạnh', 'clear', 'vi')).toBe('Trời quang mây tạnh');
    // Even when this file has its own idiomatic entry for that value.
    expect(clarificationValueLabel('weather', 'clear', 'vi')).toBe('Trời quang');
  });

  it('is ignored when it merely repeats the raw value', () => {
    expect(clarificationChoiceLabel('weather', 'heavy_rain', 'heavy_rain', 'vi')).toBe('Mưa lớn');
  });
});

describe('the value itself', () => {
  it('is never what gets translated', () => {
    // Only labels move. Whatever the label says, `value` is what is sent, and
    // these functions return text for display and never touch it.
    const value = 'heavy_rain';
    expect(clarificationValueLabel('weather', value, 'vi')).not.toBe(value);
    expect(value).toBe('heavy_rain');
  });
});
