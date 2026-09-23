import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { prepareAppState } from './testSetup';

const TELEMETRY = '.fg-map-canvas .fg-map-telemetry';
const WARNING = '.forecast-map-container .unofficial-badge';
const CONTROLS = '.forecast-map-container .map-toolbar-bottom-right';
const GRADE = '.fg-grade-overlay';
const LEGEND = '.forecast-map-container .map-legend';

/** Real SPC report-feed host the grading run must hit (today.csv when "use today" is checked). */
const SPC_REPORTS_URL_PREFIX = 'https://www.spc.noaa.gov/climo/reports/';

/** Wind report fixtures used to push the run past the Limited-report ceiling. */
const WIND_FIXTURES = [
  { time: '1810', speed: '60' },
  { time: '1845', speed: '65' },
  { time: '1920', speed: '70' },
];

type LonLat = [longitude: number, latitude: number];

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

/** Ray-casts a lon/lat point against a GeoJSON linear ring. */
const isPointInRing = ([x, y]: LonLat, ring: number[][]): boolean => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if (Number.isFinite(xi) === false || Number.isFinite(yi) === false) continue;
    if (
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

type ExportPackageJson = {
  forecastCycle?: unknown;
  forecast?: { forecastCycle?: unknown };
};

type ForecastCycleJson = {
  days?: Record<string, unknown>;
};

type ForecastDayJson = {
  data?: { wind?: unknown };
};

type WindFeatureJson = {
  geometry?: { type?: string; coordinates?: number[][][] } | null;
};

/** Reads the forecast JSON out of an export zip; throws when neither entry exists. */
const parseForecastPackage = async (zip: JSZip): Promise<ExportPackageJson> => {
  const entry = zip.file('workflow_package.json') ?? zip.file('forecast_cycle.json');
  if (!entry) {
    throw new Error('Forecast export is missing workflow_package.json and forecast_cycle.json');
  }
  return JSON.parse(await entry.async('string')) as ExportPackageJson;
};

/** Forecast cycle day map, found at either export layout; empty when the package omits it. */
const forecastCycleDays = (packageJson: ExportPackageJson): Record<string, unknown> => {
  const forecastCycle = packageJson.forecastCycle ?? packageJson.forecast?.forecastCycle;
  const days = (forecastCycle as ForecastCycleJson | undefined)?.days;
  return days ?? {};
};

/** Outer GeoJSON ring of a drawn wind polygon, or null when the feature is not one. */
const windPolygonOuterRing = (feature: unknown): number[][] | null => {
  const geometry = (feature as WindFeatureJson | null | undefined)?.geometry;
  if (geometry?.type !== 'Polygon') return null;
  const ring = geometry.coordinates?.[0];
  return Array.isArray(ring) ? ring : null;
};

/** Rings from one [timestamp, features] wind tuple; malformed tuples yield none. */
const windRingsFromTuple = (tuple: unknown): number[][][] => {
  if (!Array.isArray(tuple)) return [];
  const features: unknown = tuple[1];
  if (!Array.isArray(features)) return [];
  const rings: number[][][] = [];
  for (const feature of features) {
    const ring = windPolygonOuterRing(feature);
    if (ring) rings.push(ring);
  }
  return rings;
};

/** Wind rings drawn for a single forecast day; missing wind data yields none. */
const windRingsFromDay = (day: unknown): number[][][] => {
  const wind = (day as ForecastDayJson | null | undefined)?.data?.wind;
  if (!Array.isArray(wind)) return [];
  const rings: number[][][] = [];
  for (const tuple of wind) {
    rings.push(...windRingsFromTuple(tuple));
  }
  return rings;
};

/** Every drawn wind polygon ring across all forecast days in the package. */
const windRingsFromPackage = (packageJson: ExportPackageJson): number[][][] => {
  const rings: number[][][] = [];
  for (const day of Object.values(forecastCycleDays(packageJson))) {
    rings.push(...windRingsFromDay(day));
  }
  return rings;
};

/** Pulls every drawn wind polygon ring out of an exported forecast package zip. */
const extractWindRings = async (downloadPath: string): Promise<number[][][]> => {
  const zip = await JSZip.loadAsync(await readFile(downloadPath));
  return windRingsFromPackage(await parseForecastPackage(zip));
};

/**
 * Picks three strictly interior points of the drawn wind polygon so fixture
 * wind reports land inside the geometry the grading run evaluates.
 */
const interiorWindReportPoints = async (downloadPath: string): Promise<LonLat[]> => {
  const rings = await extractWindRings(downloadPath);

  for (const ring of rings) {
    const vertices = ring.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (vertices.length < 3) continue;
    const centroid: LonLat = [
      vertices.reduce((sum, [x]) => sum + x, 0) / vertices.length,
      vertices.reduce((sum, [, y]) => sum + y, 0) / vertices.length,
    ];
    const candidates: LonLat[] = [centroid];
    for (const [vx, vy] of vertices) {
      for (const pull of [0.2, 0.35, 0.5, 0.65]) {
        candidates.push([
          vx + (centroid[0] - vx) * pull,
          vy + (centroid[1] - vy) * pull,
        ]);
      }
    }

    const interior: LonLat[] = [];
    for (const candidate of candidates) {
      if (!isPointInRing(candidate, ring)) continue;
      const duplicate = interior.some(
        ([x, y]) => Math.abs(x - candidate[0]) < 1e-7 && Math.abs(y - candidate[1]) < 1e-7,
      );
      if (!duplicate) interior.push(candidate);
      if (interior.length === WIND_FIXTURES.length) break;
    }
    if (interior.length === WIND_FIXTURES.length) return interior;
  }

  throw new Error('Could not place three wind reports inside the drawn wind polygon');
};

/** Builds the today.csv body with one wind report per interior fixture point. */
const buildWindReportsCsv = (points: LonLat[]): string =>
  [
    'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
    'Time,Speed,Location,County,State,Lat,Lon,Comments',
    ...points.map(([longitude, latitude], index) => {
      const fixture = WIND_FIXTURES[index];
      return `${fixture.time},${fixture.speed},Fixture ${index + 1},Fixture,OK,${latitude.toFixed(4)},${longitude.toFixed(4)},Inside drawn polygon`;
    }),
    'Time,Size,Location,County,State,Lat,Lon,Comments',
  ].join('\n');

/** Runs the real grading flow with local fixtures for the two external evidence feeds. */
const gradeThroughFixtureFeeds = async (page: Page, windReportsCsv: string) => {
  const spcReportUrls: string[] = [];
  await page.route(`${SPC_REPORTS_URL_PREFIX}**`, (route) => {
    spcReportUrls.push(route.request().url());
    return route.fulfill({
      contentType: 'text/csv',
      body: windReportsCsv,
    });
  });
  await page.route('**/services.dat.noaa.gov/**', (route) => route.abort());
  await page.getByLabel('Use today instead').check();
  const gradeButton = page.getByRole('button', { name: 'Grade forecast' });
  await expect(gradeButton).toBeEnabled();
  await gradeButton.click();
  const gradeValue = page.getByTestId('forecast-grade-value');
  await expect(gradeValue).toBeVisible({ timeout: 30000 });
  await expect(gradeValue).toHaveText(/^\d+\.\d$/);
  await expect(page.locator(GRADE)).toBeAttached();
  expect(spcReportUrls.length, 'SPC today.csv fixture must be intercepted').toBeGreaterThan(0);
  expect(
    spcReportUrls.every((url) => url.startsWith(SPC_REPORTS_URL_PREFIX)),
    `Unexpected SPC report URLs: ${JSON.stringify(spcReportUrls)}`,
  ).toBe(true);
  await expect(page.locator(TELEMETRY)).toContainText(`${WIND_FIXTURES.length} REPORTS`);
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
  const windReportsCsv = buildWindReportsCsv(await interiorWindReportPoints(path));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/verification');
  await page.getByLabel('Upload forecast file').setInputFiles(path);
  const verificationViewport = page.locator('.fg-map-pane .ol-viewport');
  await expect(verificationViewport).toBeVisible({ timeout: 15000 });

  await gradeThroughFixtureFeeds(page, windReportsCsv);

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
      await expectNoOverlap(page, LEGEND, TELEMETRY);
      await expectNoOverlap(page, LEGEND, GRADE);
      await expectNoOverlap(page, LEGEND, WARNING);
      await expectNoOverlap(page, LEGEND, CONTROLS);
      await expectInsideMapPane(page, LEGEND);

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
