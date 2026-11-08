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
    await page.goto('/discussion/thread/42?workspace=severe&group=day1&keep=1#editor');
    await expect(page).toHaveURL(/\/forecast\/severe\?workspace=severe&group=day1&keep=1&surface=discussion#editor/);
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
  });

  test('preserves the custom workspace hint on a legacy Discussion link', async ({ page }) => {
    await page.goto('/discussion?workspace=custom&group=day1&keep=1#editor');
    await expect(page).toHaveURL(/\/forecast\/custom\?workspace=custom&group=day1&keep=1&surface=discussion#editor/);
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to Custom map' }).click();
    await expect(page).toHaveURL(/\/forecast\/custom\?workspace=custom&group=day1&keep=1#editor/);
    await expect(page.locator('.forecast-workspace-layout')).toBeVisible();
  });

  test('persists the layout choice and allows a query override', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/forecast/severe');
    await page.getByRole('button', { name: 'Side panel' }).click();
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--panel/);
    await expect(page.getByRole('complementary', { name: 'Forecast discussion' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page.getByRole('complementary', { name: 'Forecast discussion' })).toBeVisible();
    const splitter = page.getByRole('separator', { name: 'Resize discussion panel' });
    await splitter.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(splitter).toHaveAttribute('aria-valuenow', '664');
    const bounds = await splitter.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2 - 80, bounds!.y + bounds!.height / 2);
    await page.mouse.up();
    await expect(splitter).toHaveAttribute('aria-valuenow', '744');
    await page.getByRole('button', { name: 'Hide panel' }).click();
    await expect(page.getByRole('complementary', { name: 'Forecast discussion' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show panel' }).click();
    await expect(page.getByRole('complementary', { name: 'Forecast discussion' })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--panel/);
    await expect(page.getByRole('separator', { name: 'Resize discussion panel' })).toHaveAttribute('aria-valuenow', '744');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/forecast/severe?discussionLayout=panel&surface=discussion');
    const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(narrowOverflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
    await page.getByRole('button', { name: 'Hide panel' }).click();
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
    await expect(page.locator('.severe-workspace__map')).not.toBeVisible();
    await page.goto('/forecast/severe?discussionLayout=tabs');
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--tabs/);
  });

  test('keeps export available in Review when no workflow is active', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/forecast/severe?surface=review');
    await expect(page.getByRole('heading', { name: 'Review and export' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save forecast' })).toBeVisible();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Export Forecast Image' })).toBeVisible();
  });

  test('moves focus out of the map when an external action opens Discussion', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/forecast/severe?discussionLayout=tabs');
    await page.getByRole('button', { name: 'Pan map' }).focus();
    await page.evaluate(() => window.dispatchEvent(new Event('gfc-open-severe-discussion')));
    await expect(page.getByRole('tab', { name: 'Discussion' })).toBeFocused();
    await expect(page).toHaveURL(/surface=discussion/);
  });

  test('keeps Discussion open on a phone when the side panel is collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/forecast/severe?surface=discussion&discussionLayout=panel');
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
    const map = page.locator('.severe-workspace__map');
    await expect(map).not.toBeVisible();
    await page.getByRole('button', { name: 'Hide panel' }).click();
    await expect(map).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
  });
});
