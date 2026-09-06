import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLandingReducedMotion } from '@/features/landing/useLandingReducedMotion';

const originalMatchMedia = window.matchMedia;

function Probe() {
  const reducedMotion = useLandingReducedMotion();
  return <output data-testid="reduced-motion-value">{String(reducedMotion)}</output>;
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
});

describe('useLandingReducedMotion', () => {
  it('reads the browser preference instead of keeping the server fallback', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        removeEventListener: vi.fn(),
      }),
    });

    render(<Probe />);

    expect(screen.getByTestId('reduced-motion-value').textContent).toBe('true');
  });
});
