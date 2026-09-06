import { expect, type Page } from '@playwright/test';

/**
 * Shared workspace fixtures. Playwright refuses to let one spec import another,
 * so the provider contract lives here for every spec that needs a logged-in
 * workspace with mocked provider data.
 */
const definition = {
  request_id: 'req-browser', job_id: null, job_status: null, correlation_id: 'corr-browser', definition_version_id: 'dv-browser', supersedes: null,
  definition: { schema_version: '1.0.0', project_id: 'project-browser', definition_id: 'definition-browser', version: 1, description: 'Live browser scenario', content_hash: 'sha256:definition' },
  claims: [], logical_ir: { actors: [{ type: 'car' }], maneuvers: [{ action: 'brake' }], environment: {}, constraints: [] }, provenance: { source: 'provider' },
};

const projectSession = {
  project_id: 'project-browser',
  project_token: 'browser-secret',
  permissions: ['read', 'author', 'operate'],
};

const authUser = {
  id: 'user-e2e',
  email: 'engineer@example.com',
  name: 'E2E Engineer',
  role: 'user',
};

/**
 * TIP-AGENT-004: the workspace exchanges the login cookie for a project-scoped
 * token on mount. The session is bootstrapped by mocking `/auth/me` (the
 * HttpOnly cookie identity probe) and navigating straight to /workspace.
 * Provider routes stay scoped; everything else is refused so a regression
 * cannot silently reach an unmocked backend.
 */
export async function installProviderContract(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill({ json: authUser });
    if (path === '/api/v1/auth/project-session') return route.fulfill({ json: projectSession });
    if (path === '/api/v1/scenario-forge/definitions') return route.fulfill({ json: { project_id: 'project-browser', items: [definition], next_cursor: null } });
    if (path === '/api/v1/projects/project-browser/registry') return route.fulfill({ json: { project_id: 'project-browser', items: [], next_cursor: null } });
    if (path === '/api/v1/projects/project-browser/agent/threads' && route.request().method() === 'GET') {
      return route.fulfill({ json: { items: [], next_cursor: null, correlation_id: 'corr-list' } });
    }
    return route.abort('blockedbyclient');
  });
}

export async function openWorkspace(page: Page) {
  await installProviderContract(page);
  await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
  // Four responsive cases start in parallel. On a cold Next dev server the
  // first client bundle can take longer than Playwright's default 5 seconds;
  // wait for the mocked provider state rather than racing compilation.
  await expect(page.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeVisible({ timeout: 20_000 });
}
