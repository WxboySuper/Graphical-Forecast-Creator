import { expect, test } from '@playwright/test';
import { prepareAppState } from './testSetup';

test('renders a drawn outlook in forecast and verification with shared map styles', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await prepareAppState(page);
  await page.goto('/?localTestAccount=premium');
  await page.getByRole('button', { name: 'Day 1', exact: true }).click();
  await page.getByRole('button', { name: 'Start Workflow', exact: true }).click();
  const viewport = page.locator('.map-container .ol-viewport');
  await expect(viewport).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /wind/i }).first().click();
  await page.getByRole('button', { name: /15%/ }).first().click();
  await page.getByRole('button', { name: 'Draw polygons' }).click();
  const box = await viewport.boundingBox();
  if (!box) throw new Error('Map viewport has no bounds');
  await page.mouse.click(box.x + box.width * .4, box.y + box.height * .35);
  await page.mouse.click(box.x + box.width * .6, box.y + box.height * .35);
  await page.mouse.dblclick(box.x + box.width * .5, box.y + box.height * .65);
  await page.getByRole('button', { name: 'Pan map' }).click();
  const forecastScreenshot = testInfo.outputPath('forecast-style.png');
  await viewport.screenshot({ path: forecastScreenshot });
  await testInfo.attach('forecast-style', { path: forecastScreenshot, contentType: 'image/png' });

  const downloadReady = page.waitForEvent('download');
  await page.locator('section[aria-label="Forecast package workflow"]').getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadReady;
  const path = await download.path();
  if (!path) throw new Error('Forecast package download has no file');
  await page.goto('/verification');
  await page.getByLabel('Upload forecast file').setInputFiles(path);
  const verificationViewport = page.locator('.fg-map-pane .ol-viewport');
  await expect(verificationViewport).toBeVisible({ timeout: 15000 });
  await page.getByRole('group', { name: 'Outlook layer' }).getByRole('button', { name: 'wind', exact: true }).click();
  await page.getByRole('button', { name: 'Base map style', exact: true }).click();
  await page.getByRole('button', { name: 'Blank (Weather)', exact: true }).click();
  await expect(verificationViewport.locator('canvas').first()).toBeVisible();
  const paintedPixels = await verificationViewport.locator('canvas').evaluateAll((canvases) =>
    canvases.some((canvas) => {
      if (canvas.width === 0 || canvas.height === 0) return false;
      const context = canvas.getContext('2d');
      if (!context) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) return true;
      }
      return false;
    }),
  );
  expect(paintedPixels).toBe(true);
  const verificationScreenshot = testInfo.outputPath('verification-style.png');
  await verificationViewport.screenshot({ path: verificationScreenshot });
  await testInfo.attach('verification-style', { path: verificationScreenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(verificationViewport.locator('canvas').first()).toBeVisible();
  const darkPaintedPixels = await verificationViewport.locator('canvas').evaluateAll((canvases) =>
    canvases.some((canvas) => {
      if (canvas.width === 0 || canvas.height === 0) return false;
      const context = canvas.getContext('2d');
      if (!context) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) return true;
      }
      return false;
    }),
  );
  expect(darkPaintedPixels).toBe(true);
  const verificationDarkScreenshot = testInfo.outputPath('verification-dark-style.png');
  await verificationViewport.screenshot({ path: verificationDarkScreenshot });
  await testInfo.attach('verification-dark-style', { path: verificationDarkScreenshot, contentType: 'image/png' });
});
