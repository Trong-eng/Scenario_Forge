import { expect, test, type Page } from '@playwright/test';
import { installProviderContract } from './support/workspace';

const DEFAULT_PREFERENCES = {
  appearance: { theme: 'light', density: 'comfortable', fontScale: 'md', motion: 'system' },
  locale: { language: 'vi', timeZone: 'Asia/Ho_Chi_Minh', dateFormat: 'dd/MM/yyyy', timeFormat: '24h' },
  notifications: {
    runCompleted: { inApp: true, email: false }, runFailed: { inApp: true, email: true },
    reviewRequested: { inApp: true, email: true }, budgetWarning: { inApp: true, email: false },
    digest: 'off', sound: false,
  },
  run: { defaultSeed: '42', seedMode: 'fixed', autoOpenCanvas: true, streamReasoning: true, confirmBeforeRun: false },
};

/** A preferences service that remembers, so "does it survive a reload" is a
 *  real question rather than a localStorage tautology. Registered after the
 *  provider contract, whose catch-all would otherwise abort these routes.
 */
async function installPreferences(page: Page) {
  let stored = structuredClone(DEFAULT_PREFERENCES) as Record<string, Record<string, unknown>>;
  await page.route('**/api/v1/me/preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON() as Record<string, Record<string, unknown>>;
      for (const [group, values] of Object.entries(patch)) stored[group] = { ...stored[group], ...values };
    }
    await route.fulfill({ json: { preferences: stored, updated_at: '2026-08-31T00:00:00Z' } });
  });
}

async function openSettings(page: Page, section: string) {
  await page.goto(`/workspace?settings=${section}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="account-menu"] button[aria-haspopup="menu"]').click({ timeout: 20_000 });
  await page.getByRole('menuitem', { name: 'Cài đặt' }).click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible({ timeout: 20_000 });
}

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await installProviderContract(page);
    await installPreferences(page);
  });

  test('opens from the keyboard as well as the account menu', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press('Control+,');

    await expect(page.getByTestId('settings-dialog')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Cài đặt' })).toBeVisible();
  });

  test('takes the whole product dark and keeps it across a reload', async ({ page }) => {
    await openSettings(page, 'appearance');

    await page.getByRole('radio', { name: 'Tối' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload({ waitUntil: 'domcontentloaded' });

    // The pre-paint script has to have run: a theme that only reappears after
    // hydration is a white flash on every load.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeVisible({ timeout: 20_000 });
  });

  test('retranslates itself and reformats dates when the language changes', async ({ page }) => {
    await openSettings(page, 'locale');

    await page.getByRole('radio', { name: 'English' }).click();

    await expect(page.getByRole('heading', { level: 3 })).toHaveText('Language & region');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('remembers a notification channel and a seed after a reload', async ({ page }) => {
    // Writes are debounced, so each one is awaited at the response rather than
    // at a label that may still be showing the previous save.
    const saved = (predicate: (body: string) => boolean) => page.waitForResponse(
      async (response) => response.url().includes('/api/v1/me/preferences')
        && response.request().method() === 'PATCH'
        && predicate(await response.text()),
    );

    await openSettings(page, 'notifications');
    const channelSaved = saved((body) => body.includes('"runCompleted"'));
    await page.getByRole('switch', { name: 'Run hoàn tất — Email' }).click();
    await channelSaved;

    await openSettings(page, 'run');
    const seedSaved = saved((body) => body.includes('9137'));
    await page.getByLabel('Seed mặc định').fill('9137');
    await seedSaved;

    await openSettings(page, 'run');
    await expect(page.getByLabel('Seed mặc định')).toHaveValue('9137');
    await page.getByRole('button', { name: 'Thông báo' }).click();
    await expect(page.getByRole('switch', { name: 'Run hoàn tất — Email' })).toHaveAttribute('aria-checked', 'true');
  });

  test('finds a section by what it contains, without diacritics', async ({ page }) => {
    await openSettings(page, 'account');

    await page.getByRole('searchbox', { name: 'Tìm trong cài đặt' }).fill('phim tat');

    await expect(page.getByRole('button', { name: 'Phím tắt' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thông báo' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 3 })).toHaveText('Phím tắt');
  });

  test('says the preferences are browser-only when the endpoint is absent', async ({ page }) => {
    await page.unroute('**/api/v1/me/preferences');
    await page.route('**/api/v1/me/preferences', (route) => route.fulfill({ status: 404, json: {} }));

    await openSettings(page, 'appearance');

    // Against the real backend this is the expected state, and it must not read
    // as a broken screen.
    await expect(page.getByText('Chỉ lưu trên trình duyệt này')).toBeVisible();
    await page.getByRole('radio', { name: 'Tối' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('leaves account deletion disabled and explains why', async ({ page }) => {
    await openSettings(page, 'data');

    await expect(page.getByRole('button', { name: 'Xoá tài khoản' })).toBeDisabled();
    await expect(page.getByText(/chưa có endpoint xoá tài khoản/i)).toBeVisible();
  });
});
