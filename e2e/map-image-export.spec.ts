/**
 * E2E contract for map-image-export.spec.
 *
 * This file defines browser-level checks for the map-image-export.spec workflow and its user-visible behavior.
 */
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareAppState } from './testSetup';

for (const theme of ['light', 'dark']) {
  test(`downloads the live forecast as a JPEG in ${theme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await prepareAppState(page);
    await page.goto('/forecast/severe');
    const viewport = page.locator('.map-container .ol-viewport');
    await expect(viewport).toBeVisible({ timeout: 10000 });
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();

    await page.getByRole('button', { name: /wind/i }).first().click();
    await page.getByRole('button', { name: /15%/ }).first().click();
    await page.getByRole('button', { name: 'Draw polygons' }).click();
    const box = await viewport.boundingBox();
    if (!box) throw new Error('Map viewport has no bounds');
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.35);
    await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.65);
    await page.getByRole('button', { name: 'Pan map' }).click();

    await page.getByRole('tab', { name: 'Tools', exact: true }).click();
    await page.getByRole('button', { name: /Map image/ }).click();
    await page.getByLabel('Image Title (optional)').fill('Export audit');
    const exportBox = await viewport.boundingBox();
    if (!exportBox) throw new Error('Export viewport has no bounds');
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('dialog', { name: 'Export Forecast Image' }).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toMatch(/^forecast-outlook-.*\.jpg$/);
    const path = testInfo.outputPath(`forecast-${theme}.jpg`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const dimensions = await page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/jpeg' }));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }, [...bytes]);
    expect(dimensions.width).toBe(Math.floor(exportBox.width) * 2);
    expect(dimensions.height).toBe(Math.floor(exportBox.height) * 2);
    await expect(page.getByText('Forecast exported successfully!', { exact: true })).toBeVisible();
  });
}