import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CursorFollower } from '@/features/landing/CursorFollower';

describe('CursorFollower', () => {
  it('renders an accessible decorative crosshair layer without canvas', () => {
    const { container } = render(<CursorFollower />);

    expect(screen.getByTestId('landing-cursor').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('landing-cursor-ring')).toBeDefined();
    expect(screen.getByTestId('landing-cursor-aura')).toBeDefined();
    expect(screen.getByTestId('landing-cursor-crosshair-h')).toBeDefined();
    expect(screen.getByTestId('landing-cursor-crosshair-v')).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
