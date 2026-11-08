import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { prepareAppState } from './testSetup';

const screenshots = resolve(process.cwd(), 'artifacts/issue-916');

test.describe('Severe discussion workspace layouts', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
  });

  for (const viewport of [
    { name: 'desktop-1440x900', width: 1440, height: 900 },
    { name: 'laptop-1366x640', width: 1366, height: 640 },
    { name: 'phone-390x844', width: 390, height: 844 },
  ]) {
    for (const layout of ['tabs', 'panel'] as const) {
      test(`captures ${layout} at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`/forecast/severe?surface=discussion&discussionLayout=${layout}`);
        await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
        await expect(page.getByPlaceholder(/Write your forecast discussion here/i)).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({ path: resolve(screenshots, `discussion-${layout}-${viewport.name}.png`), fullPage: false });
      });
    }
  }

  test('legacy discussion links preserve query, group, and hash while opening Discussion', async ({ page }) => {
    await page.goto('/discussion?workspace=severe&group=day1&keep=1#editor');
    await expect(page).toHaveURL(/\/forecast\/severe\?workspace=severe&group=day1&keep=1&surface=discussion#editor/);
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
  });

  test('persists the layout choice and allows a query override', async ({ page }) => {
    await page.goto('/forecast/severe');
    await page.getByRole('button', { name: 'Side panel' }).click();
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--panel/);
    await page.reload();
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--panel/);
    await page.goto('/forecast/severe?discussionLayout=tabs');
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--tabs/);
  });
});
