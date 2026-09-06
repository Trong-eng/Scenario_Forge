import { expect, test } from '@playwright/test';

test('runs one configured golden prompt through the real workspace UI', async ({ page }) => {
  test.skip(!process.env.GOLDEN_PROMPT, 'Set GOLDEN_PROMPT for live UI evaluation');
  await page.goto(process.env.TARGET_URL || '/workspace', { waitUntil: 'domcontentloaded' });
  const composer = page.getByLabel('Agent message');
  await expect(composer).toBeVisible();
  await composer.fill(process.env.GOLDEN_PROMPT!);
  await page.getByRole('button', { name: /send|gửi|start agent thread/i }).click();
  await expect(page.locator('body')).toContainText(/agent|scenario|clarification|cần bổ sung/i);
});
