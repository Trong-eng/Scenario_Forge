import { expect, test, type Page } from '@playwright/test';
import { openWorkspace } from './support/workspace';

/**
 * TIP-SF-036: the worker guide is decorative, so it is verified by geometry and
 * by the clip it plays, never by pixel comparison. The important browser-only
 * question is placement: the guide measures a lane it is rendered inside, which
 * jsdom cannot prove.
 */
/** The guide is desktop-only: a Canvas without fullscreen keeps its no-guide layout. */
const guideViewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
];

async function guideGeometry(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-testid="workspace-worker-guide"]') as HTMLElement | null;
    const sprite = document.querySelector('[data-testid="workspace-worker-sprite"]') as HTMLCanvasElement | null;
    const active = document.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null;
    if (!box || !sprite || !active) return null;
    const boxRect = box.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    return {
      clip: box.dataset.guideClip,
      travelling: box.dataset.guideTravelling,
      frame: sprite.dataset.spriteFrame ?? '0',
      facing: sprite.dataset.spriteFacing,
      spriteWidth: Math.round(sprite.getBoundingClientRect().width),
      spriteHeight: Math.round(sprite.getBoundingClientRect().height),
      backgroundImage: getComputedStyle(sprite).backgroundImage,
      centreOffset: Math.round((boxRect.left + boxRect.width / 2) - (tabRect.left + tabRect.width / 2)),
      boxLeft: Math.round(boxRect.left),
    };
  });
}

for (const viewport of guideViewports) {
  test(`worker guide stands on its active tab at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openWorkspace(page);

    const guide = page.getByTestId('workspace-worker-guide');
    await expect(guide).toBeAttached();
    await expect(page.getByTestId('workspace-worker-sprite')).toBeAttached();

    // The lane measures over a few frames and the worker may have to run to its
    // tab, so wait for it to arrive rather than racing the layout.
    await expect
      .poll(async () => Math.abs((await guideGeometry(page))?.centreOffset ?? 9_999), { timeout: 8_000 })
      .toBeLessThanOrEqual(8);
    await expect.poll(async () => (await guideGeometry(page))?.travelling, { timeout: 8_000 }).toBe('false');
    const geometry = await guideGeometry(page);
    expect(geometry).not.toBeNull();
    // The v2 cell is 320x448 fitted to the lane box by height.
    expect(geometry!.spriteWidth).toBe(90);
    expect(geometry!.spriteHeight).toBe(126);
    expect(geometry!.backgroundImage).toContain('worker-run-v2');
    // Nothing is built yet, so the pipeline still has work: the worker keeps
    // running where it stands rather than holding a pose.
    expect(geometry!.clip).toBe('run');
    expect(geometry!.travelling).toBe('false');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/playwright-results/worker-guide-${viewport.width}.png` });
  });
}

test('keeps the compact Canvas free of the guide at 1024×768', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openWorkspace(page);

  await expect(page.getByTestId('workspace-worker-sprite')).toHaveCount(0);
  const lane = page.getByTestId('workspace-guide-lane');
  await expect(lane).toBeAttached();
  expect(await lane.evaluate((node) => node.className)).toContain('h-0');
  expect(await page.getByTestId('workspace-worker-guide').evaluate((node: HTMLElement) => node.hidden)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('runs the cycle while it crosses to a new tab position, then settles again', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openWorkspace(page);
  await expect(page.getByTestId('workspace-worker-sprite')).toBeAttached();
  await expect
    .poll(async () => Math.abs((await guideGeometry(page))?.centreOffset ?? 9_999), { timeout: 8_000 })
    .toBeLessThanOrEqual(8);
  await expect.poll(async () => (await guideGeometry(page))?.travelling, { timeout: 8_000 }).toBe('false');

  const before = await guideGeometry(page);
  expect(before!.travelling).toBe('false');
  expect(before!.clip).toBe('run');

  // Fullscreen re-measures the lane, so the tab bounds move and the worker has
  // real ground to cross — the same path a Structured -> Build switch takes.
  await page.getByRole('region', { name: 'Bảng dựng kịch bản' }).getByRole('button', { name: 'Phóng to canvas' }).click();
  await expect(page.getByTestId('forge-background')).toHaveAttribute('data-canvas-presentation', 'fullscreen');

  await expect.poll(async () => (await guideGeometry(page))?.travelling, { timeout: 2_000 }).toBe('true');
  const running = await guideGeometry(page);
  expect(running!.clip).toBe('run');
  expect(['1', '-1']).toContain(running!.facing);

  // The frame clock advances while it runs, without a React render per frame.
  await expect.poll(async () => (await guideGeometry(page))?.frame, { timeout: 2_000 }).not.toBe(running!.frame);

  // It arrives, keeps working on the spot, and stays inside the lane.
  await expect.poll(async () => (await guideGeometry(page))?.travelling, { timeout: 4_000 }).toBe('false');
  const settled = await guideGeometry(page);
  expect(settled!.clip).toBe('run');
  expect(Math.abs(settled!.centreOffset)).toBeLessThanOrEqual(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/playwright-results/worker-guide-after-travel.png' });
});

test('holds one static frame under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);
  await expect(page.getByTestId('workspace-worker-sprite')).toBeAttached();

  const first = await guideGeometry(page);
  await page.waitForTimeout(600);
  const second = await guideGeometry(page);
  expect(second!.frame).toBe(first!.frame);
  expect(second!.travelling).toBe('false');
});

/**
 * A finished Run is the only state that reaches the front-facing poses, so this
 * fixture supplies one: a registry lineage whose run succeeded, plus the build,
 * artifacts and run view the workspace hydrates from it.
 */
const project = 'project-browser';
const buildId = 'build-terminal';
const runId = 'run-terminal';

const terminalBuild = {
  build_id: buildId, project_id: project, definition_version_id: 'dv-browser', definition_id: 'definition-browser',
  definition_version: 1, variant_id: 'variant-terminal', variant_version: 1,
  parent_definition_hash: 'sha256:definition', variant_hash: 'sha256:variant',
  catalog_version: '1.0.0', catalog_reference_id: 'catalog-1',
  requested_generation_mode: 'baseline', generation_mode: 'baseline', fallback_used: false,
  retrieval_id: null, retrieval_hash: null, artifact_references: [],
  generator_version: '1.0.0', model_version: '1.0.0', prompt_version: '1.0.0',
  component_versions: {}, toolchain_versions: {}, scenic_source: 'scenario stub',
  validation_report: {}, compile_report: {}, sampling_report: {}, repair_history: [],
  manifest_hash: 'sha256:manifest',
};

const terminalRunView = {
  run: { run_id: runId, build_id: buildId, manifest_hash: 'sha256:manifest', seed: 7, status: 'succeeded' },
  job_id: 'job-terminal', approval_id: 'approval-terminal', attempt: 1, status: 'succeeded',
  progress: { phase: 'completed', completed_steps: 4, total_steps: 4 },
  sampled_values: {}, versions: null, failure: null,
  cleanup: { outcome: 'released', detail: null }, artifact: null, replay_of: null,
};

const registryLineage = {
  project_id: project, definition_version_id: 'dv-browser', definition_id: 'definition-browser', definition_version: 1,
  definition_hash: 'sha256:definition', variant_id: 'variant-terminal', variant_version: 1, variant_hash: 'sha256:variant',
  build_id: buildId, manifest_hash: 'sha256:manifest', requested_generation_mode: 'baseline',
  effective_generation_mode: 'baseline', fallback_used: false, retrieval_id: null, retrieval_hash: null,
  run_id: runId, run_seed: 7, run_status: 'succeeded', runtime_versions: {}, definition_semantic: {},
  variant_semantic: {}, variant_provenance: {}, build_toolchain_versions: {}, artifact_ids: [], artifact_states: {},
  evaluation_id: null, evaluation_outcome: null, evaluation_details: {}, failure_code: null, source_version: '1.0.0',
};

async function openWorkspaceWithFinishedRun(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill({ json: { id: 'user-e2e', email: 'engineer@example.com', name: 'E2E Engineer', role: 'user' } });
    if (path === '/api/v1/auth/project-session') return route.fulfill({ json: { project_id: project, project_token: 'browser-secret', permissions: ['read', 'author', 'operate'] } });
    if (path === '/api/v1/scenario-forge/definitions') {
      return route.fulfill({ json: { project_id: project, items: [{
        request_id: 'req-browser', job_id: null, job_status: null, correlation_id: 'corr-browser',
        definition_version_id: 'dv-browser', supersedes: null,
        definition: { schema_version: '1.0.0', project_id: project, definition_id: 'definition-browser', version: 1, description: 'Live browser scenario', content_hash: 'sha256:definition' },
        claims: [], logical_ir: { actors: [{ type: 'car' }], maneuvers: [{ action: 'brake' }], environment: {}, constraints: [] },
        provenance: { source: 'provider' },
      }], next_cursor: null } });
    }
    if (path === `/api/v1/projects/${project}/registry`) return route.fulfill({ json: { project_id: project, items: [registryLineage], next_cursor: null } });
    if (path === `/api/v1/projects/${project}/builds/${buildId}`) return route.fulfill({ json: terminalBuild });
    if (path === `/api/v1/projects/${project}/builds/${buildId}/artifacts`) return route.fulfill({ json: [] });
    if (path === `/api/v1/projects/${project}/runs/${runId}`) return route.fulfill({ json: terminalRunView });
    if (path === `/api/v1/projects/${project}/agent/threads` && route.request().method() === 'GET') {
      return route.fulfill({ json: { items: [], next_cursor: null, correlation_id: 'corr-list' } });
    }
    // Anything else the workspace probes is absent, not broken.
    return route.fulfill({ status: 404, json: { schema_version: '1.0.0', failure_class: 'INPUT_OR_CONTRACT', code: 'NOT_FOUND', message: 'absent', retryable: false, correlation_id: 'corr-404' } });
  });
  await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeVisible({ timeout: 20_000 });
}

test('turns front and folds its arms on a finished Run, then raises the clipboard on the way back', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openWorkspaceWithFinishedRun(page);
  await expect(page.getByTestId('workspace-worker-sprite')).toBeAttached();

  const canvas = page.getByRole('region', { name: 'Bảng dựng kịch bản' });
  await canvas.getByRole('tab', { name: /Lượt chạy/ }).click();

  // Braking and turning play before the crossed-arms hold, from the second atlas.
  await expect.poll(async () => (await guideGeometry(page))?.clip, { timeout: 8_000 }).toBe('crossed_arms');
  const held = await guideGeometry(page);
  expect(held!.backgroundImage).toContain('worker-transitions-v1');
  expect(held!.spriteWidth).toBe(90);
  expect(held!.spriteHeight).toBe(126);
  expect(held!.facing).toBe('1');

  await canvas.getByRole('tab', { name: /Cấu trúc/ }).click();
  await expect.poll(async () => (await guideGeometry(page))?.clip, { timeout: 8_000 }).toBe('review_clipboard');
  const reviewing = await guideGeometry(page);
  expect(reviewing!.backgroundImage).toContain('worker-transitions-v1');
  // Travelling left mirrors every clip, the turn and the pose it lands on
  // included, so the worker can never turn one way while running the other.
  expect(reviewing!.facing).toBe('-1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/playwright-results/worker-guide-review.png' });
});
