import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceOrbit } from '@/features/landing/EvidenceOrbit';

describe('EvidenceOrbit', () => {
  it('staggeres each evidence question around the authored ellipse tracks', () => {
    render(<EvidenceOrbit />);

    const facts = screen.getAllByTestId('orbit-fact');
    expect(facts).toHaveLength(5);
    expect(facts.map((fact) => fact.getAttribute('data-orbit-track'))).toEqual([
      'outer',
      'inner',
      'outer',
      'inner',
      'outer',
    ]);
    expect(facts.map((fact) => (fact as HTMLElement).style.animationDelay)).toEqual([
      '0s',
      '0s',
      '-9.333s',
      '-11s',
      '-18.667s',
    ]);
    expect(facts.map((fact) => (fact as HTMLElement).style.offsetRotate)).toEqual([
      '0deg',
      '0deg',
      '0deg',
      '0deg',
      '0deg',
    ]);
  });
});
