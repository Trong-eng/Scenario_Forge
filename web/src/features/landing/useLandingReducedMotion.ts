'use client';

import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

/** Reads the resolved `data-motion` attribute rather than the media query
 *  alone: a user who chose Reduced in Settings without touching their OS is
 *  asking for the same thing, and the attribute is where that choice lands.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  if (typeof window.matchMedia !== 'function') return () => observer.disconnect();
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => { observer.disconnect(); media.removeEventListener('change', onChange); };
}

function getSnapshot() {
  const attribute = document.documentElement.dataset.motion;
  if (attribute === 'reduce') return true;
  if (attribute === 'full') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

function getServerSnapshot() {
  return false;
}

export function useLandingReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
