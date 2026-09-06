import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroThumbnail } from '@/features/landing/HeroThumbnail';

describe('HeroThumbnail', () => {
  it('renders the approved Edufun thumbnail as an eager responsive image', () => {
    render(<HeroThumbnail />);

    const image = screen.getByRole('img', { name: /Scenario Forge Edufun/ });
    expect(image.getAttribute('src')).toContain('url=%2Flanding%2Fscenario-forge-edufun-thumbnail-v2.png');
    expect(image.getAttribute('width')).toBe('1920');
    expect(image.getAttribute('height')).toBe('1080');
    expect(image.getAttribute('fetchpriority')).toBe('high');
  });

  it('keeps the approved thumbnail static while workflow motion lives below the fold', () => {
    const { container } = render(<HeroThumbnail />);

    expect(screen.getByTestId('hero-thumbnail').getAttribute('data-motion')).toBe('static');
    expect(container.querySelector('[data-testid="hero-proof-trace"]')).toBeNull();
    expect(screen.getByTestId('hero-thumbnail').getAttribute('data-testid')).toBe('hero-thumbnail');
  });
});
