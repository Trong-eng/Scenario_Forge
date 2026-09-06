import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FireflyField } from '@/features/landing/FireflyField';
import { LandingIntroGate } from '@/features/landing/LandingIntroGate';

describe('LandingIntroGate', () => {
  it('server-renders the dark intro immediately with an accessible cord and static worker', () => {
    render(<LandingIntroGate><h1 id="hero-title">Landing</h1></LandingIntroGate>);

    expect(screen.getByRole('button', { name: /bật scenario forge bằng dây/i })).toBeDefined();
    expect(screen.getByRole('img', { name: /công nhân scenario forge/i })).toHaveAttribute('data-motion', 'static');
    expect(screen.getByTestId('landing-intro')).toHaveAttribute('data-intro-state', 'armed');
    expect(screen.getByRole('link', { name: /scenario forge — về đầu trang/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /vào workspace/i })).toHaveAttribute('href', '/workspace');
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('keeps the portal visually unavailable before ignition', () => {
    render(<LandingIntroGate><h1 id="hero-title">Landing</h1></LandingIntroGate>);
    expect(screen.getByTestId('intro-portal')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('intro-worker-point')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('intro-worker-wave')).toHaveAttribute('data-active', 'false');
    expect(document.getElementById('hero-title')).toBeTruthy();
  });

  it('enters ignition immediately and swaps to the wave pose during the flare', () => {
    render(<LandingIntroGate><h1 id="hero-title">Landing</h1></LandingIntroGate>);
    fireEvent.click(screen.getByRole('button', { name: /bật scenario forge bằng dây/i }));

    expect(screen.getByTestId('landing-intro')).toHaveAttribute('data-intro-state', 'igniting');
    expect(screen.getByTestId('intro-worker-point')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('intro-worker-wave')).toHaveAttribute('data-active', 'true');
  });
});

describe('FireflyField', () => {
  it('uses deterministic paired core and halo particles without canvas', () => {
    const { container } = render(<FireflyField reducedMotion={false} />);
    const particles = screen.getAllByTestId('firefly');

    expect(particles).toHaveLength(10);
    for (const particle of particles) {
      expect(particle.querySelector('[data-firefly-halo]')).not.toBeNull();
      expect(particle.querySelector('[data-firefly-core]')).not.toBeNull();
    }
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('marks the field static for reduced motion', () => {
    render(<FireflyField reducedMotion />);
    expect(screen.getByTestId('firefly-field')).toHaveAttribute('data-motion', 'static');
  });
});
