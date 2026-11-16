/** Verifies the Severe workspace surfaces: Discussion in full-width and side-panel layouts, the legacy /discussion handoff, Review, and focus handling. */
import { expect, test, type Page } from '@playwright/test';
import { prepareAppState } from './testSetup';

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

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
      test(`shows Discussion without horizontal overflow: ${layout} at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`/forecast/severe?surface=discussion&discussionLayout=${layout}`);
        const tabList = page.getByRole('tablist', { name: 'Severe forecast workspace' });
        await expect(tabList.getByRole('tab')).toHaveCount(3);
        await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
        await expect(page.getByPlaceholder(/Write your forecast discussion here/i)).toBeVisible();
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('legacy discussion links preserve query, group, and hash while opening Discussion', async ({ page }) => {
    await page.goto('/discussion/thread/42?workspace=severe&group=day1&keep=1#editor');
    await expect(page).toHaveURL(/\/forecast\/severe\?group=day1&keep=1&surface=discussion#editor/);
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
  });

  test('preserves the custom workspace hint on a legacy Discussion link', async ({ page }) => {
    await page.goto('/discussion?workspace=custom&group=day1&keep=1#editor');
    await expect(page).toHaveURL(/\/forecast\/custom\?group=day1&keep=1&surface=discussion#editor/);
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
    const customMap = page.locator('.custom-workspace__map');
    await expect(customMap).toBeAttached();
    await expect(customMap).toHaveAttribute('aria-hidden', 'true');
    await page.getByRole('button', { name: 'Return to Custom map' }).click();
    await expect(page).toHaveURL(/\/forecast\/custom\?group=day1&keep=1#editor/);
    await expect(customMap).toBeVisible();
    await expect(page.locator('.forecast-workspace-layout')).toBeVisible();
  });

  test('keeps the Custom map interactive when a review surface hint is present', async ({ page }) => {
    await page.goto('/forecast/custom?surface=review');
    const customMap = page.locator('.custom-workspace__map');
    await expect(customMap).toBeVisible();
    await expect(customMap).not.toHaveAttribute('aria-hidden', 'true');
    await expect(customMap).not.toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: 'Pan map' })).toBeVisible();
    await expect(page).not.toHaveURL(/surface=review/);
  });

  test('opens Discussion beside the map, resizes it, and remembers the layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/forecast/severe');
    await page.getByRole('button', { name: 'Side panel' }).click();
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--panel/);
    await expect(page.getByRole('complementary', { name: 'Forecast discussion' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page.getByRole('complementary', { name: 'Forecast discussion' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pan map' })).toBeVisible();

    const splitter = page.getByRole('separator', { name: 'Resize discussion panel' });
    await splitter.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(splitter).toHaveAttribute('aria-valuenow', '584');
    const bounds = await splitter.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2 - 80, bounds!.y + bounds!.height / 2);
    await page.mouse.up();
    await expect(splitter).toHaveAttribute('aria-valuenow', '664');

    await page.getByRole('tab', { name: 'Map' }).click();
    await expect(page.getByRole('complementary', { name: 'Forecast discussion' })).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('severe-workspace')).toHaveClass(/severe-workspace--panel/);
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page.getByRole('separator', { name: 'Resize discussion panel' })).toHaveAttribute('aria-valuenow', '664');
  });

  test('stacks the Discussion fields in a narrow side panel and switches between Edit and Preview', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/forecast/severe?surface=discussion&discussionLayout=panel');
    const preview = page.getByRole('button', { name: 'Preview' });
    await expect(preview).toBeVisible();
    await expect(page.getByText('Live Preview')).toBeHidden();
    const validFrom = page.getByLabel('Valid From');
    const box = await validFrom.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(200);

    await preview.click();
    await expect(page.getByText('Live Preview')).toBeVisible();
    await expect(page.getByPlaceholder(/Write your forecast discussion here/i)).toBeHidden();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByPlaceholder(/Write your forecast discussion here/i)).toBeVisible();
  });

  test('falls back to full width on a phone and hides the layout choice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/forecast/severe?discussionLayout=panel&surface=discussion');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Discussion layout' })).toHaveCount(0);
    const map = page.locator('.severe-workspace__map');
    await expect(map).not.toBeVisible();
    await expect(map).toHaveAttribute('aria-hidden', 'true');
    await page.getByRole('tab', { name: 'Map' }).click();
    await expect(map).toBeVisible();
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
});
