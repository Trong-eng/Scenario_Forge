import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  disconnect = vi.fn();
  observe = vi.fn((target: Element) => {
    this.callback([{
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRatio: 1,
      intersectionRect: target.getBoundingClientRect(),
      isIntersecting: true,
      rootBounds: null,
      target,
      time: performance.now(),
    }], this);
  });
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  writable: true,
  value: TestIntersectionObserver,
});

// Motion measures animated height transitions by preserving the current scroll
// position. jsdom exposes scrollTo but intentionally throws when it is called.
Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

// jsdom implements neither of these, and the product's own listbox
// (`SelectField`) and scroll containers call them on every keyboard move.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() { /* no layout in jsdom */ };
}
