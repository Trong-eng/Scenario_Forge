import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EvidenceBoard } from '@/features/landing/EvidenceBoard';
import { HeroThumbnail } from '@/features/landing/HeroThumbnail';
import { RunEvidencePassage } from '@/features/landing/RunEvidencePassage';

describe('landing light-motion policy', () => {
  it('ships a static, semantic hero artifact without canvas or WebGL controls', () => {
    const { container } = render(<HeroThumbnail />);

    expect(screen.getByRole('img', { name: /Scenario Forge Edufun/ })).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('[data-testid="hero-proof-trace"]')).toBeNull();
  });

  it('uses declarative image layers for authored workflow motion without a render loop', () => {
    const { container } = render(<EvidenceBoard state="run-evidence" />);

    expect(screen.getByTestId('evidence-board').getAttribute('data-evidence-state')).toBe('run-evidence');
    expect(screen.getByTestId('evidence-scene-run-evidence').getAttribute('data-active')).toBe('true');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('uses the local CARLA run video as evidence with a poster and real playback control', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { container, unmount } = render(<RunEvidencePassage />);
    const video = screen.getByTestId('run-evidence-video');

    expect(video.getAttribute('src')).toBe('/carla-sim.mp4');
    expect(video.getAttribute('poster')).toBe('/carla-pov.jpg');
    expect(video.getAttribute('preload')).toBe('metadata');
    expect((video as HTMLVideoElement).autoplay).toBe(true);
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: /Phát video mô phỏng CARLA/ }).hasAttribute('disabled')).toBe(false);
    unmount();
    play.mockRestore();
    pause.mockRestore();
  });
});
