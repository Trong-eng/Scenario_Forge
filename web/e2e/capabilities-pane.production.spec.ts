import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const apiPort = process.env.TIP008_API_PORT ?? '8003';
const apiBaseUrl = process.env.TIP008_API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;

function evidenceDirectory(testInfo: { outputDir: string }): string {
  return path.resolve(
    process.env.TIP008_EVIDENCE_DIR ?? testInfo.outputDir,
  );
}

test('@provider @tip008-provider uses the real local capability/auth path without interception', async ({ page }, testInfo) => {
  const evidenceDir = evidenceDirectory(testInfo);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const tracePath = path.join(evidenceDir, 'tip-scenario-002-008-production.trace.zip');
  const screenshotPath = path.join(evidenceDir, 'tip-scenario-002-008-production.png');
  const manifestPath = path.join(evidenceDir, 'tip-scenario-002-008-production.json');
  const observedRequests: Array<{ method: string; path: string; status?: number }> = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(apiBaseUrl).origin) {
      observedRequests.push({ method: request.method(), path: url.pathname });
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(apiBaseUrl).origin) {
      const request = observedRequests.findLast((item) => item.path === url.pathname && item.status === undefined);
      if (request) request.status = response.status();
    }
  });

  await page.context().tracing.start({ screenshots: true, snapshots: true });
  try {
    const unauthenticated = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
    expect(unauthenticated.status()).toBe(401);

    await page.goto('/login');
    const login = await page.evaluate(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/auth/dev-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          email: 'tip008-browser@example.invalid',
          name: 'TIP-008 production browser',
        }),
      });
      return {
        status: response.status,
        payload: await response.json() as { user: { email: string } },
      };
    }, apiBaseUrl);
    expect(login.status).toBe(200);

    expect(login.payload.user.email).toBe('tip008-browser@example.invalid');

    const projectSessionResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/v1/auth/project-session'
      && response.request().method() === 'POST'
      && response.status() === 200
    ));
    const capabilityListResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname.endsWith('/capabilities')
      && response.request().method() === 'GET'
      && response.status() === 200
    ));
    await page.goto('/workspace');
    const projectSession = await projectSessionResponse;
    const sessionPayload = await projectSession.json() as {
      project_id: string;
      project_token: string;
    };
    const capabilityList = await capabilityListResponse;

    await expect(page.getByRole('button', { name: 'Mở Năng lực' })).toBeVisible();
    await page.getByRole('button', { name: 'Mở Năng lực' }).click();
    await expect(page.getByTestId('capabilities-ready')).toBeVisible();
    await expect(page.getByTestId('capabilities-version')).toContainText('1.0.0');

    const wrongProject = await page.request.get(
      `${apiBaseUrl}/api/v1/projects/${sessionPayload.project_id}-other/capabilities`,
      {
        headers: {
          'X-Project-Token': sessionPayload.project_token,
          'X-Correlation-ID': 'tip008-browser-wrong-project',
        },
      },
    );
    expect(wrongProject.status()).toBe(403);
    const wrongProjectPayload = await wrongProject.json() as { code: string };
    expect(wrongProjectPayload.code).toBe('WRONG_PROJECT');

    const wrongToken = await page.request.get(
      `${apiBaseUrl}/api/v1/projects/${sessionPayload.project_id}/capabilities`,
      {
        headers: {
          'X-Project-Token': 'sfp_unknown.browser-secret',
          'X-Correlation-ID': 'tip008-browser-wrong-token',
        },
      },
    );
    expect(wrongToken.status()).toBe(403);
    const wrongTokenPayload = await wrongToken.json() as { code: string };
    expect(wrongTokenPayload.code).toBe('UNKNOWN_TOKEN');

    const checkResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === `/api/v1/projects/${sessionPayload.project_id}/capabilities/check`
      && response.request().method() === 'POST'
      && response.status() === 200
    ));
    await page.getByTestId('capability-toggle-overtake').click();
    const check = await checkResponse;
    const checkPayload = await check.json() as { check: string; safe_alternatives: string[] };
    expect(checkPayload.check).toBe('unsupported');
    expect(checkPayload.safe_alternatives).toContain('crossing');
    await expect(page.getByTestId('capability-safe-alternatives-overtake')).toContainText('crossing');

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
        evidence: 'real create_app capability/auth path + real TokenService/Authorizer; capability-path-only',
        known_limitation: 'Workspace /definitions read returns 500 because local provider uses sessions=object(); not full production composition',
        project_id: sessionPayload.project_id,
        boundary_results: {
          unauthenticated_me: unauthenticated.status(),
          dev_login: login.status,
          project_session: projectSession.status(),
          capability_list: capabilityList.status(),
          wrong_project: {
            status: wrongProject.status(),
            code: wrongProjectPayload.code,
          },
          unknown_token: {
            status: wrongToken.status(),
            code: wrongTokenPayload.code,
          },
          capability_check: {
            status: check.status(),
            check: checkPayload.check,
          },
        },
        observed_requests: observedRequests,
        side_effect_requests: sideEffectRequests,
        screenshot: path.basename(screenshotPath),
        trace: path.basename(tracePath),
      }, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await page.context().tracing.stop({ path: tracePath });
  }
});
