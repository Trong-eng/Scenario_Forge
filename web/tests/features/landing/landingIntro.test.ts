import { describe, expect, it } from 'vitest';
import {
  clampCordPull,
  CORD_MAX_PULL,
  CORD_PULL_THRESHOLD,
  getIntroSequence,
  markLandingIntroSeen,
  resolveIntroBootstrapState,
  shouldActivateCord,
  shouldShowLandingIntro,
} from '@/features/landing/landingIntro';

describe('landing intro gate model', () => {
  it('fails open when session storage is unavailable', () => {
    expect(shouldShowLandingIntro(null)).toBe(false);
    expect(() => markLandingIntroSeen(null)).not.toThrow();
  });

  it('shows once per session and records the completed intro', () => {
    const storage = new Map<string, string>();
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as unknown as Storage;

    expect(shouldShowLandingIntro(session)).toBe(true);
    markLandingIntroSeen(session);
    expect(shouldShowLandingIntro(session)).toBe(false);
  });

  it('clamps pull distance and activates only after the authored threshold', () => {
    expect(clampCordPull(-10)).toBe(0);
    expect(clampCordPull(CORD_MAX_PULL + 10)).toBe(CORD_MAX_PULL);
    expect(shouldActivateCord(CORD_PULL_THRESHOLD - 1)).toBe(false);
    expect(shouldActivateCord(CORD_PULL_THRESHOLD)).toBe(true);
  });

  it('decides pending or seen before paint and fails open when storage throws', () => {
    const fresh = { getItem: () => null } as unknown as Storage;
    const returning = { getItem: () => 'true' } as unknown as Storage;
    const blocked = { getItem: () => { throw new Error('blocked'); } } as unknown as Storage;

    expect(resolveIntroBootstrapState(fresh)).toBe('pending');
    expect(resolveIntroBootstrapState(returning)).toBe('seen');
    expect(resolveIntroBootstrapState(blocked)).toBe('seen');
    expect(resolveIntroBootstrapState(null)).toBe('seen');
  });

  it('holds the visible portal for a full beat before the landing reveal begins', () => {
    expect(getIntroSequence(false)).toEqual([
      { at: 0, state: 'igniting' },
      { at: 300, state: 'lit' },
      { at: 400, state: 'portal' },
      { at: 1400, state: 'revealing' },
      { at: 1950, state: 'complete' },
    ]);
    expect(getIntroSequence(true)).toEqual([{ at: 0, state: 'complete' }]);
  });
});
