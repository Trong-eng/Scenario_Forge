import { describe, expect, it } from 'vitest';
import { clarificationChoiceLabel, clarificationValueLabel } from '../../../src/components/forge/clarificationLabels';

describe('clarificationValueLabel', () => {
  it('maps location canonical values to friendly Vietnamese labels', () => {
    expect(clarificationValueLabel('location', 'intersection')).toBe('Ngã tư / giao lộ');
    expect(clarificationValueLabel('location', 'roundabout')).toBe('Vòng xuyến');
    expect(clarificationValueLabel('location', 'straight_road')).toBe('Đường thẳng');
  });

  it('maps field-specific canonical history values without changing their value', () => {
    expect(clarificationValueLabel('visibility', 'clear')).toBe('Tầm nhìn rõ');
    expect(clarificationValueLabel('visibility', 'poor')).toBe('Tầm nhìn kém');
    expect(clarificationValueLabel('visibility', 'fog')).toBe('Sương mù');
    expect(clarificationValueLabel('approach', 'right')).toBe('Từ bên phải');
  });

  it('uses a readable deterministic fallback for an unknown canonical value', () => {
    expect(clarificationValueLabel('weather', 'coastal_fog')).toBe('Coastal fog');
  });

  it('preserves a trusted server-provided friendly label', () => {
    expect(clarificationChoiceLabel('weather', 'Nắng', 'clear')).toBe('Nắng');
    expect(clarificationChoiceLabel('location', 'roundabout', 'roundabout')).toBe('Vòng xuyến');
  });
});
