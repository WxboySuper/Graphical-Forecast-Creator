import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareAppState } from './testSetup';

const openForecast = async (page: import('@playwright/test').Page) => {
  await prepareAppState(page);
  await page.goto('/forecast?localBetaBypass=true');
  await expect(page.locator('.map-container')).toBeVisible({ timeout: 10_000 });
};

test.describe('local-only custom layers', () => {
  test('switches cleanly, draws, identifies, deletes, and undoes a custom polygon', async ({ page }) => {
    await openForecast(page);
    await expect(page.getByRole('radiogroup', { name: 'Drawing product' })).toBeVisible();
    await page.getByRole('radio', { name: 'Custom' }).click();
    await page.getByRole('button', { name: 'Add custom layer' }).click();
    await page.getByLabel('Layer title').fill('Winter impacts');
    await page.getByLabel('Layer title').blur();
    await page.getByLabel('Category label').fill('Heavy snow');
    await page.getByLabel('Category label').blur();
    await page.getByLabel('Category hatch').selectOption('crosshatch');
    await expect(page.getByRole('complementary', { name: 'Map Legend' })).toContainText('Heavy snow');

    await page.getByRole('button', { name: 'Draw polygons' }).click();
    const viewport = page.locator('.map-container .ol-viewport');
    const box = await viewport.boundingBox();
    if (!box) throw new Error('Map viewport has no measurable bounds');
    const points = [
      [box.x + box.width * .42, box.y + box.height * .38],
      [box.x + box.width * .58, box.y + box.height * .38],
      [box.x + box.width * .52, box.y + box.height * .58],
    ] as const;
    await page.mouse.click(...points[0]);
    await page.mouse.click(...points[1]);
    await page.mouse.dblclick(...points[2]);

    await page.getByRole('button', { name: 'Pan map' }).click();
    await page.mouse.click(box.x + box.width * .51, box.y + box.height * .46);
    await expect(page.locator('.ol-popup')).toContainText('Heavy snow');

    await page.getByRole('button', { name: 'Delete polygons' }).click();
    await page.mouse.click(box.x + box.width * .51, box.y + box.height * .46);
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(page.getByRole('button', { name: 'Redo' }).first()).toBeEnabled();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save' }).first().click();
    const download = await downloadPromise;
    const savedPath = await download.path();
    if (!savedPath) throw new Error('Custom forecast download has no readable path');
    const saved = JSON.parse(await readFile(savedPath, 'utf8'));
    expect(saved.forecastCycle.days['1'].customLayers.layers[0].features).toHaveLength(1);
    expect(saved.forecastCycle.days['1'].customLayers.layers[0].categories[0].style.hatch).toBe('crosshatch');
  });

  for (const viewport of [
    { name: 'portrait phone', width: 390, height: 844 },
    { name: 'landscape phone', width: 932, height: 430 },
  ]) {
    test(`keeps the toggle and map usable on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openForecast(page);
      await expect(page.getByRole('radio', { name: 'Severe' })).toBeVisible();
      await page.getByRole('radio', { name: 'Custom' }).click();
      await expect(page.getByRole('button', { name: 'Add custom layer' })).toBeVisible();
      await expect(page.locator('.map-container')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
