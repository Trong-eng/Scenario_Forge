import { expect, test } from '@playwright/test';
import { openWorkspace } from './support/workspace';

test('renders provider data and never exposes credentials', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('body')).not.toContainText('browser-secret');
  await expect(page.locator('body')).not.toContainText('MOCK_UI');
});

test('mobile navigation remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openWorkspace(page);
  // Compact viewport collapses the sidebar; the header exposes one opener.
  const opener = page.getByRole('button', { name: 'Mở điều hướng từ đầu trang' });
  await expect(opener).toBeVisible();
  await opener.click();
  await expect(page.getByRole('navigation', { name: 'Điều hướng Forge' })).toBeVisible();
  await page.getByRole('button', { name: 'Lượt chạy' }).click();
  // The compact sidebar is a modal: collapse it to reveal the Runs surface.
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt chạy' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`keeps the workspace Canvas usable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openWorkspace(page);

    const canvas = page.getByRole('region', { name: 'Bảng dựng kịch bản' });
    await expect(canvas).toBeVisible();
    await expect(canvas.getByRole('tablist', { name: 'Workbench views' }).getByRole('tab')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const separator = page.getByRole('separator', { name: 'Thay đổi kích thước Chat và Canvas' });
    if (await separator.count()) {
      await separator.focus();
      await page.keyboard.press('End');
      await expect(separator).toHaveAttribute('aria-valuenow', await separator.getAttribute('aria-valuemax') ?? '');
      if (viewport.width === 1920) {
        const sizes = await separator.evaluate((node) => ({
          now: Number(node.getAttribute('aria-valuenow')),
          workspace: node.parentElement?.getBoundingClientRect().width ?? 0,
        }));
        expect(Math.abs(sizes.now / sizes.workspace - 0.5)).toBeLessThan(0.01);
      }

      await canvas.getByRole('button', { name: 'Phóng to canvas' }).click();
      await expect(page.getByTestId('forge-background')).toHaveAttribute('data-canvas-presentation', 'fullscreen');
      await expect(page.getByRole('complementary', { name: 'Điều hướng kịch bản' })).toBeHidden();
      expect(await page.locator('#workspace-panel-agent').evaluate((node) => node.isConnected)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('forge-background')).toHaveAttribute('data-canvas-presentation', 'split');
    } else {
      const switcher = page.getByRole('tablist', { name: 'Workspace surfaces' });
      await expect(switcher).toBeVisible();
      await expect(canvas.getByRole('button', { name: 'Phóng to canvas' })).toHaveCount(0);
      await switcher.getByRole('tab', { name: 'Canvas' }).click();
      await expect(canvas).toBeVisible();
      await switcher.getByRole('tab', { name: 'Chat' }).click();
      await expect(page.locator('#workspace-panel-agent')).toBeVisible();
    }

    if (viewport.width === 390) {
      await page.getByRole('button', { name: 'Mở Năng lực' }).click();
      await expect(page.getByRole('dialog', { name: 'Capabilities' })).toBeVisible();
      await page.getByRole('button', { name: 'Close capabilities' }).click();
    }
  });
}

test('keeps a manual Canvas close across refresh and returns focus to the artifact', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);

  await page.getByRole('button', { name: 'Đóng canvas' }).click();
  const artifact = page.getByRole('button', { name: 'Mở canvas: Định nghĩa v1' });
  await artifact.focus();
  await artifact.click();
  await page.getByRole('button', { name: 'Đóng canvas' }).click();
  await expect(artifact).toBeFocused();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Bảng dựng kịch bản' })).toHaveCount(0);
  await expect(artifact).toBeVisible();
  await artifact.click();
  await expect(page.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeVisible();
});
