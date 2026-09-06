import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const apiBaseUrl = process.env.TIP007_API_BASE_URL ?? 'http://127.0.0.1:8001';

function evidenceDirectory(testInfo: { outputDir: string }): string {
  return path.resolve(
    process.env.TIP007_EVIDENCE_DIR ?? testInfo.outputDir,
  );
}

test('@provider @tip007-provider uses the authenticated real capability endpoints and saves evidence', async ({ page, context }, testInfo) => {
  const evidenceDir = evidenceDirectory(testInfo);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const tracePath = path.join(evidenceDir, 'tip-scenario-002-007-real.trace.zip');
  const detailScreenshotPath = path.join(evidenceDir, 'tip-scenario-002-007-real-detail.png');
  const screenshotPath = path.join(evidenceDir, 'tip-scenario-002-007-real.png');
  const manifestPath = path.join(evidenceDir, 'tip-scenario-002-007-real.json');
  const observedRequests: Array<{ method: string; path: string }> = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(apiBaseUrl).origin) {
      observedRequests.push({ method: request.method(), path: url.pathname });
    }
  });

  await context.addCookies([
    {
      name: 'tip007-session',
      value: 'authenticated',
      url: apiBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await context.tracing.start({ screenshots: true, snapshots: true });

  try {
    await page.goto('/workspace');
    const capabilitiesButton = page.getByRole('button', { name: 'Mở Năng lực' });
    await expect(capabilitiesButton).toBeVisible();
    await capabilitiesButton.click();
    await expect(page.getByTestId('capabilities-ready')).toBeVisible();
    await expect(page.getByTestId('capabilities-version')).toContainText('1.0.0');

    const checkResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === `/api/v1/projects/tip007-real-project/capabilities/check`
      && response.request().method() === 'POST'
      && response.status() === 200
    ));
    await page.getByTestId('capability-toggle-overtake').click();
    const check = await checkResponse;
    const checkPayload = await check.json() as { safe_alternatives: string[]; check: string };
    expect(checkPayload.check).toBe('unsupported');
    expect(checkPayload.safe_alternatives).toContain('crossing');
    await expect(page.getByTestId('capability-safe-alternatives-overtake')).toContainText('crossing');
    await page.getByTestId('capability-detail-overtake').screenshot({ path: detailScreenshotPath });

    await page.getByTestId('capability-use-crossing').click();
    await expect(page.getByRole('dialog', { name: 'Capabilities' })).toBeHidden();
    await expect(page.locator('#agent-thread-message')).toHaveValue('kịch bản: crossing');
    expect((await page.locator('#agent-thread-message').inputValue()).length).toBeLessThanOrEqual(64);
    await expect(page.locator('#agent-thread-message')).not.toHaveValue(/scenario_ir|scenic_source/i);

    const sideEffectRequests = observedRequests.filter(({ method, path: requestPath }) => (
      method !== 'GET' && /\/definitions|\/builds|\/runs/.test(requestPath)
    ));
    expect(sideEffectRequests).toEqual([]);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({
        status: 'passed',
        endpoint: '/api/v1/projects/{project_id}/capabilities',
        check_endpoint: '/api/v1/projects/{project_id}/capabilities/check',
        observed_requests: observedRequests,
        side_effect_requests: sideEffectRequests,
        detail_screenshot: path.basename(detailScreenshotPath),
        screenshot: path.basename(screenshotPath),
        trace: path.basename(tracePath),
      }, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await context.tracing.stop({ path: tracePath });
  }
});
