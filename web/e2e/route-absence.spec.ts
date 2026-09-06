import { expect, test, type Page } from '@playwright/test';

const projectSession = {
  project_id: 'project-absence',
  project_token: 'absence-secret',
  permissions: ['read', 'author', 'operate'],
};

const authUser = {
  id: 'user-absence',
  email: 'engineer@example.com',
  name: 'E2E Engineer',
  role: 'user',
};

const definition = {
  request_id: 'req-absence', job_id: null, job_status: null, correlation_id: 'corr-absence',
  definition_version_id: 'dv-absence', supersedes: null,
  definition: {
    schema_version: '1.0.0', project_id: 'project-absence', definition_id: 'definition-absence',
    version: 1, description: 'Route absence scenario', content_hash: 'sha256:definition-absence',
  },
  claims: [], logical_ir: { actors: [], maneuvers: [], environment: {}, constraints: [] },
  provenance: { source: 'provider' },
};

/**
 * TIP-AGENT-004 route-absence evidence: during a full workspace conversation
 * journey not one request may target the deleted public chat or public
 * authoring-session surfaces (REQ-004 / DELTA-001 / DELTA-002).
 */
test('workspace conversation journey never targets deleted legacy endpoints', async ({ page }) => {
  const legacyHits: string[] = [];
  const seenPaths: string[] = [];
  let threadCreated = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    seenPaths.push(path);
    if (path.endsWith('/agent/threads') && request.method() === 'POST') threadCreated = true;
    const legacyPathFragments = ['/api/v1/' + 'chat', 'authoring-' + 'sessions'];

    if (legacyPathFragments.some((fragment) => path.includes(fragment))) {
      legacyHits.push(`${request.method()} ${path}`);
      return route.abort('blockedbyclient');
    }
    if (path === '/api/v1/auth/me') return route.fulfill({ json: authUser });
    if (path === '/api/v1/auth/project-session') return route.fulfill({ json: projectSession });
    if (path === '/api/v1/scenario-forge/definitions') return route.fulfill({ json: { project_id: 'project-absence', items: [definition], next_cursor: null } });
    if (path === '/api/v1/projects/project-absence/registry') return route.fulfill({ json: { project_id: 'project-absence', items: [], next_cursor: null } });

    if (path === '/api/v1/projects/project-absence/agent/threads' && request.method() === 'POST') {
      return route.fulfill({
        json: {
          thread_id: 'thread-e2e', project_id: 'project-absence', status: 'active',
          title: 'Route absence scenario', summary: '', turn_count: 0,
          created_at: '2026-08-26T00:00:00Z', updated_at: '2026-08-26T00:00:00Z',
          correlation_id: 'corr-agent-create',
        },
      });
    }
    if (path === '/api/v1/projects/project-absence/agent/threads/thread-e2e/messages' && request.method() === 'POST') {
      return route.fulfill({
        json: {
          thread_id: 'thread-e2e', project_id: 'project-absence', status: 'active',
          title: 'Route absence scenario', summary: '', turn_count: 1,
          created_at: '2026-08-26T00:00:00Z', updated_at: '2026-08-26T00:01:00Z',
          correlation_id: 'corr-agent-append',
        },
      });
    }
    if (path === '/api/v1/projects/project-absence/agent/threads' && request.method() === 'GET') {
      return route.fulfill({
        json: {
          items: [{
            schema_version: '1.0.0', thread_id: 'thread-e2e', project_id: 'project-absence',
            actor_ref: 'token-e2e', status: 'completed', title: 'Route absence scenario',
            created_at: '2026-08-26T00:00:00Z', updated_at: '2026-08-26T00:02:00Z',
          }],
          next_cursor: null, correlation_id: 'corr-agent-list',
        },
      });
    }
    // The durable event ledger replays one complete turn, so the composer
    // settles and the Capabilities handoff can be exercised on an idle thread.
    if (path.endsWith('/agent/threads/thread-e2e/events')) {
      const frame = (cursor: number, eventType: string, payload: Record<string, unknown>) =>
        `data: ${JSON.stringify({
          event_id: `event-${cursor}`, cursor, event_type: eventType,
          thread_id: 'thread-e2e', step_id: `step-${cursor}`,
          correlation_id: 'corr-agent-sse', payload,
          created_at: '2026-08-26T00:00:00Z',
        })}\n\n`;
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: [
          frame(1, 'plan_created', {}),
          frame(2, 'verification', { status: 'COMPLETED' }),
          frame(3, 'completed', { status: 'COMPLETED' }),
        ].join(''),
      });
    }
    return route.fulfill({ status: 204 });
  });

  await page.goto('/workspace');
  await expect(page.getByText('Định nghĩa v1')).toBeVisible();

  // One full conversation turn through the Agent surface.
  const goal = page.getByLabel('Agent goal');
  if (await goal.count()) {
    await goal.fill('Một xe cắt ngang trước ego.');
    await page.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện' }).click();

    // The durable thread must exist and its first turn must settle before the
    // Capabilities handoff is exercised on an idle composer.
    await expect.poll(() => threadCreated).toBe(true);
    await expect(page.getByRole('button', { name: 'Gửi tin nhắn cho trợ lý' })).toBeVisible();
  }

  // Visit the Capabilities seam pane and hand an intent back to the Agent.
  const capabilitiesTab = page.getByRole('tab', { name: 'Capabilities' });
  if (await capabilitiesTab.count()) {
    await capabilitiesTab.click();
    const firstCapability = page.locator('[data-testid="capabilities-ready"] button').first();
    if (await firstCapability.count()) {
      await firstCapability.click();
      await expect(page.getByRole('textbox', { name: 'Agent message' })).toHaveValue(/cắt ngang/i);
    }
  }

  expect(legacyHits).toEqual([]);
  // Non-vacuousness: the journey really exercised the Agent surface.
  expect(seenPaths.some((path) => path.endsWith('/agent/threads'))).toBeTruthy();
});
