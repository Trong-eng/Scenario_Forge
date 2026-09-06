import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'short desktop', width: 1440, height: 650 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
const localBaseUrl = `http://127.0.0.1:${process.env.PLAYWRIGHT_LOCAL_PORT ?? '3109'}`;

async function enterLanding(page: Page) {
  await page.goto('/');
  const skip = page.getByRole('button', { name: /bỏ qua intro/i });
  await skip.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  if (await skip.isVisible()) {
    await skip.click();
    await expect(page.getByTestId('landing-intro')).toHaveCount(0);
  }
  await expect(page.locator('#hero-title')).toBeVisible();
}

async function pageHealth(page: Page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    htmlLang: document.documentElement.lang,
    sectionCount: document.querySelectorAll('main > section').length,
  }));
}

test.describe('Light editorial landing', () => {
  test('keeps the light landing hidden from the first fresh-session paint', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.clear());
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-sf-intro', 'pending');
    await expect(page.getByTestId('landing-intro')).toBeVisible();
    await expect(page.locator('#hero-title')).toBeHidden();
  });

  test('fails open before paint when session storage cannot be read', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Storage.prototype, 'getItem', {
        configurable: true,
        value: () => { throw new Error('storage blocked'); },
      });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-sf-intro', 'seen');
    await expect(page.getByTestId('landing-intro')).toBeHidden();
    await expect(page.locator('#hero-title')).toBeVisible();
  });

  test('pairs each moving firefly with its halo and pauses the field when hidden', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.clear());
    await page.goto('/');

    const fly = page.getByTestId('firefly').first();
    const sample = () => fly.evaluate((node) => {
      const core = node.querySelector('[data-firefly-core]')!.getBoundingClientRect();
      const halo = node.querySelector('[data-firefly-halo]')!.getBoundingClientRect();
      const parent = node.getBoundingClientRect();
      return {
        coreX: core.x + core.width / 2,
        coreY: core.y + core.height / 2,
        haloX: halo.x + halo.width / 2,
        haloY: halo.y + halo.height / 2,
        x: parent.x,
        y: parent.y,
      };
    });
    const before = await sample();
    await page.waitForTimeout(260);
    const after = await sample();
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.2);
    expect(Math.abs(after.coreX - after.haloX)).toBeLessThan(1);
    expect(Math.abs(after.coreY - after.haloY)).toBeLessThan(1);

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('firefly-field')).toHaveAttribute('data-paused', 'true');
  });

  for (const viewport of viewports) {
    test(`${viewport.name} keeps intro actors separated through the portal reveal`, async ({ page }) => {
      await page.addInitScript(() => sessionStorage.clear());
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByTestId('intro-portal')).toHaveAttribute('aria-hidden', 'true');

      await page.getByRole('button', { name: /bật scenario forge bằng dây/i }).click();
      await expect(page.getByTestId('landing-intro')).not.toHaveAttribute('data-intro-state', 'armed');
      await expect(page.getByTestId('landing-intro')).toHaveAttribute('data-intro-state', 'portal', { timeout: 2000 });

      const boxes = await Promise.all([
        page.getByTestId('intro-identity').boundingBox(),
        page.getByTestId('lamp-stage').boundingBox(),
        page.getByTestId('intro-worker').boundingBox(),
        page.getByTestId('intro-speech').boundingBox(),
        page.getByTestId('intro-portal').boundingBox(),
      ]);
      const names = ['identity', 'lamp', 'worker', 'speech', 'portal'];
      expect(boxes.every(Boolean)).toBe(true);
      const overlaps = (a: NonNullable<(typeof boxes)[number]>, b: NonNullable<(typeof boxes)[number]>) => (
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
      );
      const collisions: string[] = [];
      for (let left = 0; left < boxes.length; left += 1) {
        for (let right = left + 1; right < boxes.length; right += 1) {
          if (overlaps(boxes[left]!, boxes[right]!)) {
            collisions.push(`${names[left]} overlaps ${names[right]}`);
          }
        }
      }
      expect(collisions, JSON.stringify({ boxes, names })).toEqual([]);
    });
  }

  test('reveals the light landing through the lamp intro', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.clear());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const intro = page.getByTestId('landing-intro');
    await expect(intro).toBeVisible();
    await expect(page.getByRole('img', { name: /công nhân scenario forge/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /bật scenario forge bằng dây/i })).toBeVisible();
    await page.getByRole('button', { name: /bật scenario forge bằng dây/i }).click();
    await expect(intro).toHaveCount(0);
    await expect(page.locator('#hero-title')).toContainText('Một tình huống. Một đường bằng chứng.');
  });

  test('only shows once per browser session and supports escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-intro')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('landing-intro')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('landing-intro')).toHaveCount(0);
  });

  test('supports keyboard activation and an immediate reduced-motion reveal', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.clear());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const cord = page.getByRole('button', { name: /bật scenario forge bằng dây/i });
    await cord.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('landing-intro')).toHaveCount(0);
    await expect(page.locator('#hero-title')).toBeFocused();
  });

  test('reveals after a downward cord drag', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.clear());
    await page.goto('/');
    const cord = page.getByRole('button', { name: /bật scenario forge bằng dây/i });
    const box = await cord.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 24);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 64, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('landing-intro')).toHaveCount(0);
  });

  for (const viewport of viewports) {
    test(`${viewport.name} keeps the light evidence journey readable at ${viewport.width}px`, async ({ page }) => {
      const failures: string[] = [];
      const anonymousApiRequests: string[] = [];
      page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
      page.on('pageerror', (error) => failures.push(error.message));
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/')) anonymousApiRequests.push(request.url());
      });

      await page.setViewportSize(viewport);
      await enterLanding(page);

      await expect(page.getByRole('heading', { level: 1 })).toContainText('Một tình huống. Một đường bằng chứng.');
      await expect(page.getByTestId('hero-thumbnail')).toBeVisible();
      await expect(page.getByRole('img', { name: /Scenario Forge Edufun/ })).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      await expect(page.getByRole('link', { name: /Scenario Forge — về đầu trang/ }).locator('img')).toHaveAttribute('src', /\/brand\//);

      const health = await pageHealth(page);
      expect(health.htmlLang).toBe('vi');
      expect(health.sectionCount).toBe(6);
      expect(health.scrollWidth).toBeLessThanOrEqual(health.clientWidth);
      expect(anonymousApiRequests).toEqual([]);
      expect(failures).toEqual([]);

      await expect(page.getByRole('link', { name: 'Mở Scenario Forge' }).first()).toHaveAttribute('href', '/workspace');
      await expect(page.locator('a[href="#workflow"]').first()).toHaveAttribute('href', '#workflow');
      const scrollCue = await page.locator('a[href="#situation"]').boundingBox();
      expect(scrollCue?.width).toBeGreaterThanOrEqual(44);
      expect(scrollCue?.height).toBeGreaterThanOrEqual(44);
    });
  }

  test('uses the approved mark and gains a light frosted header after scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    const header = page.getByTestId('landing-header');
    const workspaceCta = header.getByRole('link', { name: /Mở workspace/ });
    await expect(header).toHaveAttribute('data-scrolled', 'false');
    await expect(header).toHaveCSS('position', 'fixed');
    await expect(workspaceCta).toHaveCSS('color', 'rgb(255, 253, 248)');
    await expect(page.getByRole('link', { name: /Scenario Forge — về đầu trang/ }).locator('img')).toHaveCount(1);

    await page.evaluate(() => window.scrollTo({ top: 240, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-scrolled', 'true');
    await expect.poll(() => header.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await expect.poll(() => header.evaluate((node) => getComputedStyle(node).backdropFilter)).not.toBe('none');
  });

  test('keeps normal workflow and CTA text at WCAG AA contrast', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    const contrastRatio = async (foreground: string, background: string) => page.evaluate(({ background, foreground }) => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (value: string) => channels(value)
        .map((channel) => channel / 255)
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (lighter + 0.05) / (darker + 0.05);
    }, { background, foreground });

    const workflowBackground = await page.locator('#workflow').evaluate((node) => getComputedStyle(node).backgroundColor);
    const chapterSignal = await page.locator('[data-chapter="description"] > span').evaluate((node) => getComputedStyle(node).color);
    const inactiveRail = await page.getByTestId('vertical-evidence-node').nth(1).evaluate((node) => getComputedStyle(node).color);
    expect(await contrastRatio(chapterSignal, workflowBackground)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(inactiveRail, workflowBackground)).toBeGreaterThanOrEqual(4.5);

    const primaryCta = page.getByRole('link', { name: 'Mở Scenario Forge' }).first();
    await primaryCta.hover();
    const hoverColors = await primaryCta.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, foreground: style.color };
    });
    expect(await contrastRatio(hoverColors.foreground, hoverColors.background)).toBeGreaterThanOrEqual(4.5);
  });

  test('restores the authored workflow and authority scroll motion', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    const journey = page.getByTestId('cinematic-journey');
    const artifact = page.getByTestId('cinematic-artifact');
    const journeyBox = await journey.boundingBox();
    expect(journeyBox).not.toBeNull();
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), journeyBox!.y + 20);
    await page.waitForTimeout(180);
    const artifactStart = await artifact.evaluate((node) => getComputedStyle(node).transform);
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), journeyBox!.y + journeyBox!.height * 0.55);
    await page.waitForTimeout(260);
    const artifactMiddle = await artifact.evaluate((node) => getComputedStyle(node).transform);
    expect(artifactMiddle).not.toBe(artifactStart);

    const authority = page.getByTestId('authority-passage');
    const authorityLine = authority.locator('h2 span').first();
    const authorityPosition = await authority.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, top: rect.top + window.scrollY };
    });
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), authorityPosition.top - 700);
    await page.waitForTimeout(180);
    const authorityStart = await authorityLine.evaluate((node) => getComputedStyle(node).transform);
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), authorityPosition.top + authorityPosition.height * 0.4);
    await page.waitForTimeout(260);
    const authorityMiddle = await authorityLine.evaluate((node) => getComputedStyle(node).transform);
    expect(authorityMiddle).not.toBe(authorityStart);
  });

  test('keeps display type breathable and pins the three authority statements through scroll', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    const displayHeadings = page.locator([
      '#hero-title',
      '#problem-title',
      '#workflow-title',
      '#trust-title',
      '#evidence-title',
      '#closing-title',
    ].join(', '));
    const lineHeightRatios = await displayHeadings.evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize);
    }));
    for (const ratio of lineHeightRatios) expect(ratio).toBeGreaterThanOrEqual(1.06);

    const authority = page.getByTestId('authority-passage');
    const sticky = page.getByTestId('authority-sticky');
    const authorityGeometry = await authority.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, top: rect.top + window.scrollY, viewport: window.innerHeight };
    });
    expect(authorityGeometry.height).toBeGreaterThanOrEqual(authorityGeometry.viewport * 2.6);
    await expect(sticky).toHaveCSS('position', 'sticky');
    await expect(sticky).toHaveCSS('top', '0px');

    const lines = authority.locator('h2 span');
    for (const [index, progress] of [0.18, 0.5, 0.82].entries()) {
      await page.evaluate(({ geometry, progress }) => window.scrollTo({
        behavior: 'instant',
        top: geometry.top + (geometry.height - geometry.viewport) * progress,
      }), { geometry: authorityGeometry, progress });
      await expect.poll(() => lines.nth(index).evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity)))
        .toBeGreaterThan(0.9);
    }
  });

  test('keeps the mobile authority headline clear of its proof notes', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await enterLanding(page);

    const authority = page.getByTestId('authority-passage');
    const geometry = await authority.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, top: rect.top + window.scrollY, viewport: window.innerHeight };
    });
    await page.evaluate((value) => window.scrollTo({
      behavior: 'instant',
      top: value.top + (value.height - value.viewport) * 0.5,
    }), geometry);

    const headline = await page.locator('#trust-title').boundingBox();
    const proofs = await authority.locator('article').first().boundingBox();
    expect(headline).not.toBeNull();
    expect(proofs).not.toBeNull();
    expect(headline!.y + headline!.height).toBeLessThanOrEqual(proofs!.y - 16);

    const lines = authority.locator('h2 span');
    for (const [index, progress] of [0.18, 0.5, 0.82].entries()) {
      await page.evaluate(({ geometry: value, progress: nextProgress }) => window.scrollTo({
        behavior: 'instant',
        top: value.top + (value.height - value.viewport) * nextProgress,
      }), { geometry, progress });
      await expect.poll(async () => {
        const box = await lines.nth(index).boundingBox();
        return Boolean(box && box.x >= 12 && box.x + box.width <= 378);
      }).toBe(true);
    }
  });

  test('restores staggered orbit tracks and the desktop crosshair without moving the thumbnail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    const facts = page.getByTestId('orbit-fact');
    await expect(facts).toHaveCount(5);
    expect(await facts.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationDelay)))
      .toEqual(['0s', '0s', '-9.333s', '-11s', '-18.667s']);
    expect(await facts.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).offsetRotate)))
      .toEqual(['0deg', '0deg', '0deg', '0deg', '0deg']);

    const thumbnail = page.getByTestId('hero-thumbnail');
    const thumbnailBefore = await thumbnail.boundingBox();
    await expect.poll(async () => {
      await page.mouse.move(20, 20);
      await page.mouse.move(640, 360, { steps: 4 });
      return page.getByTestId('landing-cursor').getAttribute('data-visible');
    }).toBe('true');
    await page.getByRole('link', { name: /Mở Scenario Forge/ }).first().hover();
    await expect(page.getByTestId('landing-cursor')).toHaveAttribute('data-hovered', 'true');
    const thumbnailAfter = await thumbnail.boundingBox();
    expect(thumbnailAfter?.x).toBeCloseTo(thumbnailBefore?.x ?? 0, 1);
    expect(thumbnailAfter?.y).toBeCloseTo(thumbnailBefore?.y ?? 0, 1);

    await expect(page.getByTestId('cinematic-artifact')).toHaveCSS('transform-style', 'preserve-3d');
  });

  test('turns real imagery into an authored evidence board as workflow checkpoints advance', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    const thumbnail = page.getByTestId('hero-thumbnail');
    await expect(thumbnail).toHaveAttribute('data-motion', 'static');
    const journey = page.getByTestId('cinematic-journey');
    const board = page.getByTestId('evidence-board');
    const position = await journey.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { range: rect.height - window.innerHeight, top: rect.top + window.scrollY };
    });

    const advanceTo = async (progress: number, state: string) => {
      await page.evaluate(({ progress, range, top }) => window.scrollTo({ top: top + range * progress, behavior: 'instant' }), { ...position, progress });
      await expect(board).toHaveAttribute('data-evidence-state', state);
    };

    await advanceTo(0.38, 'scenario-ir');
    await expect(page.getByTestId('evidence-scene-scenario-ir')).toHaveAttribute('data-active', 'true');
    await advanceTo(0.64, 'approval');
    await expect(page.getByTestId('evidence-scene-approval')).toHaveAttribute('data-active', 'true');
    await advanceTo(0.9, 'run-evidence');
    await expect(page.getByTestId('evidence-scene-run-evidence')).toHaveAttribute('data-active', 'true');
  });

  test('plays the local CARLA run only while its evidence stage is in view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    const evidence = page.getByTestId('run-evidence-passage');
    const video = page.getByTestId('run-evidence-video');
    await expect(video).toHaveAttribute('src', '/carla-sim.mp4');
    await expect(video).toHaveAttribute('poster', '/carla-pov.jpg');
    await video.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate((node: HTMLVideoElement) => ({
      currentTime: node.currentTime,
      paused: node.paused,
      readyState: node.readyState,
    }))).toMatchObject({ paused: false, readyState: 4 });
    await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(0);

    const playbackControl = evidence.getByRole('button', { name: /video mô phỏng CARLA/ });
    await expect(playbackControl).toHaveCSS('opacity', '0');
    const videoFrame = await video.locator('..').boundingBox();
    expect(videoFrame).not.toBeNull();
    await page.mouse.move(videoFrame!.x + 24, videoFrame!.y + 24);
    await expect(playbackControl).toHaveCSS('opacity', '1');
    await page.mouse.move(1400, 20);
    await expect(playbackControl).toHaveCSS('opacity', '0');

    await page.evaluate(() => window.scrollTo({ behavior: 'instant', top: 0 }));
    await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
  });

  test('keeps the changing evidence board visible beside later checkpoints on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enterLanding(page);

    const journey = page.getByTestId('cinematic-journey');
    const board = page.getByTestId('evidence-board');
    const position = await journey.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { range: rect.height - window.innerHeight, top: rect.top + window.scrollY };
    });
    await page.evaluate(({ range, top }) => window.scrollTo({ top: top + range * 0.64, behavior: 'instant' }), position);

    await expect(board).toHaveAttribute('data-evidence-state', 'approval');
    await expect(board).toBeInViewport({ ratio: 0.75 });
  });

  test('reduced motion resolves to a stable static artifact without a render loop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLanding(page);

    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.getByTestId('hero-thumbnail').locator('div').first().evaluate((node) => getComputedStyle(node).transform)).toBe('none');
    await expect.poll(() => page.getByTestId('orbit-fact').first().evaluate((node) => getComputedStyle(node).animationPlayState)).toBe('paused');
    await expect(page.getByTestId('evidence-board')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page.getByTestId('cinematic-artifact')).toHaveCSS('transform', 'none');
    await expect(page.getByTestId('run-evidence-video')).toHaveJSProperty('paused', true);
    await expect(page.getByRole('heading', { name: 'AI đề xuất. Hệ thống kiểm định. Con người quyết định.' })).toBeVisible();
  });

  test('semantic proof content remains visible when JavaScript is disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${localBaseUrl}/`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('img', { name: /Scenario Forge Edufun/ })).toBeVisible();
    await expect(page.getByText('Hash-bound approval')).toBeVisible();
    await expect(page.getByText('SYNTHETIC PREVIEW', { exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await context.close();
  });
});
