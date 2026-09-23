import { expect, test, type Locator, type Page } from '@playwright/test';
import { prepareAppState } from './testSetup';

const TELEMETRY = '.fg-map-canvas .fg-map-telemetry';
const WARNING = '.forecast-map-container .unofficial-badge';
const CONTROLS = '.forecast-map-container .map-toolbar-bottom-right';
const GRADE = '.fg-grade-overlay';
const LEGEND = '.forecast-map-container .map-legend';

const expectNoOverlap = async (page: Page, firstSelector: string, secondSelector: string) => {
  const first = await page.locator(firstSelector).boundingBox();
  const second = await page.locator(secondSelector).boundingBox();
  if (!first || !second) {
    throw new Error(`Expected visible bounds for ${firstSelector} and ${secondSelector}`);
  }

  const separated =
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y;
  expect(
    separated,
    `${firstSelector} must not overlap ${secondSelector}: ${JSON.stringify({ first, second })}`,
  ).toBe(true);
};

/** Fails when an overlay escapes the map pane's visible, clipped box. */
const expectInsideMapPane = async (page: Page, selector: string) => {
  const pane = await page.locator('.fg-map-pane').boundingBox();
  const box = await page.locator(selector).boundingBox();
  if (!pane || !box) {
    throw new Error(`Expected visible bounds for .fg-map-pane and ${selector}`);
  }

  const epsilon = 1;
  const inside =
    box.x >= pane.x - epsilon &&
    box.y >= pane.y - epsilon &&
    box.x + box.width <= pane.x + pane.width + epsilon &&
    box.y + box.height <= pane.y + pane.height + epsilon;
  expect(
    inside,
    `${selector} must sit inside the visible map pane: ${JSON.stringify({ box, pane })}`,
  ).toBe(true);
};

const expectTelemetryContentFits = async (page: Page) => {
  const telemetry = page.locator(TELEMETRY);
  const metrics = await telemetry.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const items = Array.from(element.children, (child) => {
      const childBounds = child.getBoundingClientRect();
      return {
        left: childBounds.left,
        right: childBounds.right,
        top: childBounds.top,
        bottom: childBounds.bottom,
      };
    });

    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
      items,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.items.length).toBeGreaterThan(0);
  for (const item of metrics.items) {
    expect(item.left).toBeGreaterThanOrEqual(metrics.bounds.left);
    expect(item.right).toBeLessThanOrEqual(metrics.bounds.right);
    expect(item.top).toBeGreaterThanOrEqual(metrics.bounds.top);
    expect(item.bottom).toBeLessThanOrEqual(metrics.bounds.bottom);
  }
};

const expectTelemetryClear = async (page: Page) => {
  await expectTelemetryContentFits(page);
  await expectNoOverlap(page, TELEMETRY, WARNING);
  await expectNoOverlap(page, TELEMETRY, CONTROLS);
  await expectNoOverlap(page, TELEMETRY, GRADE);
  await expectNoOverlap(page, GRADE, WARNING);
  await expectInsideMapPane(page, TELEMETRY);
  await expectInsideMapPane(page, WARNING);
  await expectInsideMapPane(page, GRADE);
};

const expectPaintedMapCanvas = async (viewport: Locator) => {
  const paintedPixels = await viewport.locator('canvas').evaluateAll((canvases) =>
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
};

/** Runs the real grading flow with local fixtures for the two external evidence feeds. */
const gradeThroughFixtureFeeds = async (page: Page) => {
  await page.route('**/spc.noaa.gov/climo/reports/**', (route) =>
    route.fulfill({
      contentType: 'text/csv',
      body: [
        'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
        'Time,Speed,Location,County,State,Lat,Lon,Comments',
        '1810,65,Norman,OK,OK,35.22,-97.44,Test wind',
        'Time,Size,Location,County,State,Lat,Lon,Comments',
      ].join('\n'),
    }),
  );
  await page.route('**/services.dat.noaa.gov/**', (route) => route.abort());
  await page.getByLabel('Use today instead').check();
  const gradeButton = page.getByRole('button', { name: 'Grade forecast' });
  await expect(gradeButton).toBeEnabled();
  await gradeButton.click();
  await expect(page.getByTestId('forecast-grade-value')).toBeVisible({ timeout: 30000 });
  await expect(page.locator(GRADE)).toBeAttached();
};

test('renders a drawn outlook in forecast and verification with shared map styles', async ({ page }, testInfo) => {
  test.setTimeout(120000);
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
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/verification');
  await page.getByLabel('Upload forecast file').setInputFiles(path);
  const verificationViewport = page.locator('.fg-map-pane .ol-viewport');
  await expect(verificationViewport).toBeVisible({ timeout: 15000 });

  await gradeThroughFixtureFeeds(page);

  await expectNoOverlap(page, TELEMETRY, WARNING);
  await expectNoOverlap(page, TELEMETRY, CONTROLS);
  await page.getByRole('group', { name: 'Outlook layer' }).getByRole('button', { name: 'wind', exact: true }).click();
  await page.getByRole('button', { name: 'Base map style', exact: true }).click();
  await page.getByRole('button', { name: 'Blank (Weather)', exact: true }).click();
  await expect(verificationViewport.locator('canvas').first()).toBeVisible();
  await expectPaintedMapCanvas(verificationViewport);
  const verificationScreenshot = testInfo.outputPath('verification-style.png');
  await verificationViewport.screenshot({ path: verificationScreenshot });
  await testInfo.attach('verification-style', { path: verificationScreenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(verificationViewport.locator('canvas').first()).toBeVisible();
  await expectPaintedMapCanvas(verificationViewport);
  await expectNoOverlap(page, TELEMETRY, WARNING);
  await expectNoOverlap(page, TELEMETRY, CONTROLS);
  const verificationDarkScreenshot = testInfo.outputPath('verification-dark-style.png');
  await verificationViewport.screenshot({ path: verificationDarkScreenshot });
  await testInfo.attach('verification-dark-style', { path: verificationDarkScreenshot, contentType: 'image/png' });

  // Phone and short-landscape geometry in both themes, with the real legend control.
  for (const size of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'short-landscape', width: 844, height: 390 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const pass of ['first', 'second'] as const) {
      if (pass === 'second') {
        await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
      }
      const theme = await page.evaluate(() =>
        document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light',
      );

      await expectTelemetryClear(page);

      await page.getByRole('button', { name: 'Show map key' }).click();
      await expect(page.locator(`${LEGEND}.map-legend--mobile-open`)).toBeVisible();
      await expectTelemetryClear(page);
      await expectNoOverlap(page, TELEMETRY, LEGEND);

      const screenshot = testInfo.outputPath(`${size.name}-${theme}-legend-open.png`);
      await page.screenshot({ path: screenshot });
      await testInfo.attach(`${size.name}-${theme}-legend-open`, {
        path: screenshot,
        contentType: 'image/png',
      });

      await page.getByRole('button', { name: 'Hide map key' }).click();
      await expect(page.locator(`${LEGEND}.map-legend--mobile-open`)).toBeHidden();
    }
  }
});
