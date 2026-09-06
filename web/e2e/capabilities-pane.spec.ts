import { expect, test, type Page } from '@playwright/test';

import { installProviderContract } from './support/workspace';

// Contract-intercept coverage only. This suite is intentionally not real
// provider evidence; the authenticated no-route-interception evidence lives in
// capabilities-pane.real.spec.ts.

const capabilityList = {
  operation: 'scenario.capabilities.list',
  schema_version: '1.0.0',
  capability_set_version: '1.0.0',
  query_id: 'capability-query:e2e-test',
  scope: { project_id: 'project-browser', actor_ref: 'test-actor' },
  status: 'available',
  items: [
    {
      capability_id: 'crossing',
      kind: 'pattern',
      display_name: 'Pedestrian crossing',
      status: 'stable',
      support_state: 'authorable',
      evidence_level: 'static_validated',
      required_fields: ['target_speed'],
      supported_actor_types: ['Car', 'Pedestrian'],
      supported_topologies: ['straight_road'],
      expected_events: ['avoidance', 'completion'],
      allowed_next_actions: ['preview', 'build'],
    },
    {
      capability_id: 'overtake',
      kind: 'primitive',
      display_name: 'Overtake a slower vehicle',
      status: 'planned',
      support_state: 'planned',
      evidence_level: 'parsed',
      required_fields: ['target_speed'],
      supported_actor_types: ['Car'],
      supported_topologies: ['multi_lane_road'],
      expected_events: ['overtake', 'order_flip'],
      allowed_next_actions: ['use_current', 'stop'],
    },
    {
      capability_id: 'hard_brake',
      kind: 'pattern',
      display_name: 'Hard brake',
      status: 'stable',
      support_state: 'authorable',
      evidence_level: 'static_validated',
      required_fields: ['target_speed', 'delay_s'],
      supported_actor_types: ['Car'],
      supported_topologies: ['straight_road'],
      expected_events: ['braking', 'completion'],
      allowed_next_actions: ['preview', 'build'],
    },
  ],
  allowed_next_actions: ['preview', 'build', 'use_current'],
  summary: 'Hệ thống hiện hỗ trợ các năng lực mô phỏng giao thông sau:\n### Dùng được ngay\n- Băng qua đường\n- Phanh gấp\n### Có thể soạn, chưa thể chạy\n- Chưa có.\n### Dự kiến hoặc chưa khả dụng\n- Vượt xe chậm\nHãy mô tả tình huống với một năng lực dùng được ngay để bắt đầu.\nXem thêm trong danh mục năng lực để xem toàn bộ danh sách.',
  error_code: null,
};

async function installCapabilitiesContract(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/v1/auth/me') {
      return route.fulfill({
        json: { id: 'user-e2e', email: 'engineer@example.com', name: 'E2E Engineer', role: 'user' },
      });
    }
    if (path === '/api/v1/auth/project-session') {
      return route.fulfill({
        json: { project_id: 'project-browser', project_token: 'browser-secret', permissions: ['read', 'author', 'operate'] },
      });
    }
    if (path === '/api/v1/scenario-forge/definitions') {
      return route.fulfill({ json: { project_id: 'project-browser', items: [], next_cursor: null } });
    }
    if (path === '/api/v1/projects/project-browser/registry') {
      return route.fulfill({ json: { project_id: 'project-browser', items: [], next_cursor: null } });
    }
    if (path === '/api/v1/projects/project-browser/capabilities') {
      return route.fulfill({ json: capabilityList });
    }
    if (path === '/api/v1/projects/project-browser/agent/threads' && route.request().method() === 'GET') {
      return route.fulfill({ json: { items: [], next_cursor: null, correlation_id: 'corr-list' } });
    }
    return route.abort('blockedbyclient');
  });
}

test('capabilities pane shows real metadata and planned lifecycle truth', async ({ page }) => {
  await installCapabilitiesContract(page);
  await page.goto('/workspace');
  await expect(page.getByRole('button', { name: 'Mở Năng lực' })).toBeVisible();
  await page.getByRole('button', { name: 'Mở Năng lực' }).click();
  await expect(page.getByRole('dialog', { name: 'Capabilities' })).toBeVisible();
  await expect(page.getByTestId('capabilities-ready')).toBeVisible();
  await expect(page.getByTestId('capabilities-version')).toContainText('1.0.0');
  // Stable item is selectable, planned overtake is visible but disabled.
  await expect(page.getByTestId('capability-crossing')).toBeVisible();
  await expect(page.getByTestId('capability-overtake')).toBeVisible();
  await expect(page.getByTestId('capability-overtake')).toHaveAttribute('data-capability-selectable', 'false');
  await expect(page.getByTestId('capability-use-overtake')).toBeDisabled();
  await expect(page.getByTestId('capability-use-crossing')).toBeEnabled();
  // Detail view for stable shows required fields and evidence.
  await page.getByTestId('capability-toggle-crossing').click();
  await expect(page.getByTestId('capability-detail-crossing')).toContainText('Required fields');
  await expect(page.getByTestId('capability-detail-crossing')).toContainText('target_speed');
  // Planned detail shows planned note.
  await page.getByTestId('capability-toggle-overtake').click();
  await expect(page.getByTestId('capability-planned-note-overtake')).toBeVisible();
  await expect(page.getByTestId('capability-planned-note-overtake')).toContainText('Planned');
});

test('capabilities pane filters and hands off bounded intent to Agent', async ({ page }) => {
  await installCapabilitiesContract(page);
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Mở Năng lực' }).click();
  await expect(page.getByTestId('capabilities-ready')).toBeVisible();

  // Filter by search
  await page.getByTestId('capabilities-search').fill('overtake');
  await expect(page.getByTestId('capability-overtake')).toBeVisible();
  await expect(page.getByTestId('capability-crossing')).toBeHidden();
  await page.getByTestId('capabilities-search').fill('');
  await expect(page.getByTestId('capability-crossing')).toBeVisible();

  // Filter by status
  await page.getByTestId('capabilities-filter-status').selectOption('planned');
  await expect(page.getByTestId('capability-overtake')).toBeVisible();
  await expect(page.getByTestId('capability-crossing')).toBeHidden();
  await page.getByTestId('capabilities-filter-status').selectOption('all');

  // Selecting a stable capability closes the drawer and inserts bounded intent.
  await page.getByTestId('capability-use-crossing').click();
  await expect(page.getByRole('dialog', { name: 'Capabilities' })).toBeHidden();
  // The Agent composer should contain the bounded intent (capability id, not raw source).
  const composer = page.locator('#agent-thread-message');
  await expect(composer).toHaveValue('kịch bản: crossing');
  await expect(composer).not.toHaveValue(/scenario_ir|scenic_source/i);
});
