export type IntroState = 'armed' | 'pulling' | 'igniting' | 'lit' | 'portal' | 'revealing' | 'complete';
export type IntroBootstrapState = 'pending' | 'seen';

export const INTRO_SESSION_KEY = 'sf_intro_seen_v1';
export const CORD_PULL_THRESHOLD = 24;
export const CORD_MAX_PULL = 56;

export const LANDING_INTRO_BOOTSTRAP = `(() => {
  try {
    const seen = window.sessionStorage.getItem('${INTRO_SESSION_KEY}') === 'true';
    document.documentElement.dataset.sfIntro = seen ? 'seen' : 'pending';
  } catch {
    document.documentElement.dataset.sfIntro = 'seen';
  }
})();`;

export function resolveIntroBootstrapState(storage: Pick<Storage, 'getItem'> | null | undefined): IntroBootstrapState {
  if (!storage) return 'seen';
  try {
    return storage.getItem(INTRO_SESSION_KEY) === 'true' ? 'seen' : 'pending';
  } catch {
    return 'seen';
  }
}

export function getIntroSequence(reducedMotion: boolean): ReadonlyArray<{ at: number; state: IntroState }> {
  if (reducedMotion) return [{ at: 0, state: 'complete' }];
  return [
    { at: 0, state: 'igniting' },
    { at: 300, state: 'lit' },
    { at: 400, state: 'portal' },
    { at: 1400, state: 'revealing' },
    { at: 1950, state: 'complete' },
  ];
}

export function shouldShowLandingIntro(storage: Storage | null | undefined) {
  if (!storage) return false;
  try {
    return storage.getItem(INTRO_SESSION_KEY) !== 'true';
  } catch {
    return false;
  }
}

export function markLandingIntroSeen(storage: Storage | null | undefined) {
  try {
    storage?.setItem(INTRO_SESSION_KEY, 'true');
  } catch {
    // Storage can be blocked by privacy mode; the page remains usable.
  }
}

export function clampCordPull(distance: number) {
  return Math.min(CORD_MAX_PULL, Math.max(0, distance));
}

export function shouldActivateCord(distance: number) {
  return distance >= CORD_PULL_THRESHOLD;
}
