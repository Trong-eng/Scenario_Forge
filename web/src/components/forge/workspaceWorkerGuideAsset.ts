/**
 * SF-036 assets: the approved 12-pose run cycle plus the 21-frame front-facing
 * transition sheet, and the static fallback. All at the 320x448 master cell.
 *
 * One sheet per clip, scaled by the browser. Pre-scaled per-ratio sheets were
 * tried and reverted: they sharpened the 100% view a little but left nothing to
 * enlarge when the page is zoomed, and keeping the right one selected needed
 * machinery in the render path that was not worth its weight. The master has
 * detail to spare at every zoom level. The v1 sheets stay on disk but are no
 * longer referenced.
 */
export const workspaceWorkerGuideAsset = {
  enabled: true,
  runAtlasSrc: '/forge/guide/worker-run-v2.webp',
  transitionAtlasSrc: '/forge/guide/worker-transitions-v1.webp',
  fallbackSrc: '/forge/guide/worker-fallback-v2.webp',
} as const;

/** Compact/mobile Canvas deliberately keeps its existing no-guide layout. */
export function shouldRenderWorkspaceWorkerGuide(assetEnabled: boolean, desktopCanvas: boolean) {
  return assetEnabled && desktopCanvas;
}
