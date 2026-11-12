import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'marketing/src/assets/live');
const appUrl = process.env.GFC_CAPTURE_URL ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
const page = await context.newPage();

await mkdir(output, { recursive: true });
await page.addInitScript(() => {
  localStorage.setItem('gfc-local-beta-bypass', 'true');
  localStorage.setItem('gfc-tos-accepted', '2');
  localStorage.setItem('gfc-privacy-policy-accepted', '2');
});

async function prepare(route) {
  await page.goto(`${appUrl}${route}${route.includes('?') ? '&' : '?'}localBetaBypass=true`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-navbar__version', { timeout: 60_000 });
  await page.evaluate(() => {
    const version = document.querySelector('.app-navbar__version');
    if (version) version.textContent = 'v2';
    document.querySelectorAll('[data-testid*="beta"], [data-testid*="feedback"], [data-testid="auto-tstm-disabled-banner"], [data-testid="categorical-error-banner"], [role="alert"]').forEach((element) => element.remove());
    document.querySelectorAll('.beta-banner, .feedback-button, [data-sonner-toaster]').forEach((element) => element.remove());
    const bannerPrefixes = ['Auto-TSTM disabled:', 'CATEGORICAL GENERATION PAUSED'];
    const isBannerText = (text) => bannerPrefixes.some((prefix) => text.startsWith(prefix));
    for (const element of document.querySelectorAll('body *')) {
      const text = element.textContent?.trim() ?? '';
      if (element.childElementCount === 0 && isBannerText(text)) {
        element.closest('[class*="banner"], [class*="alert"], [class*="notice"]')?.remove();
        element.remove();
      }
    }
  });
  await page.waitForTimeout(2500);
}

async function seedTornadoOutlook() {
  await page.evaluate(async () => {
    const { createEmptyOutlook } = await import('/src/store/forecastStateFactory.ts');
    const { serializeForecastWorkspace } = await import('/src/utils/forecastWorkspacePersistenceAdapter.ts');
    const timestamp = '2026-04-21T12:00:00.000Z';
    const day = createEmptyOutlook(1, timestamp);
    const rings = [
      ['2%', [[-103, 40], [-98, 41], [-92, 40], [-89, 37], [-94, 35], [-101, 36], [-103, 40]], false],
      ['5%', [[-101, 39.5], [-97, 40.2], [-93, 39.4], [-91, 37], [-95, 36], [-100, 36.5], [-101, 39.5]], false],
      ['10%', [[-99.5, 39], [-96, 39.5], [-93, 38.8], [-92, 37], [-95, 36.8], [-98.5, 37.2], [-99.5, 39]], true],
      ['15%', [[-97.5, 38.6], [-95.5, 38.9], [-93.5, 38.2], [-93, 37.1], [-95, 37], [-97.2, 37.4], [-97.5, 38.6]], true],
    ];
    for (const [probability, coordinates, isSignificant] of rings) {
      day.data.tornado.set(probability, [{
        type: 'Feature',
        id: `marketing-tornado-${probability}`,
        geometry: { type: 'Polygon', coordinates: [coordinates] },
        properties: { outlookType: 'tornado', probability, isSignificant, derivedFrom: 'tornado', originalProbability: probability },
      }]);
    }
    day.data.tornado.set('CIG1', [{
      type: 'Feature',
      id: 'marketing-tornado-significant-hatch',
      geometry: { type: 'Polygon', coordinates: [[[-99.5, 39], [-96, 39.5], [-93, 38.8], [-92, 37], [-95, 36.8], [-98.5, 37.2], [-99.5, 39]]] },
      properties: { outlookType: 'tornado', probability: 'CIG1', isSignificant: true, derivedFrom: 'tornado', originalProbability: '10%' },
    }]);
    const cycle = { days: { 1: day }, currentDay: 1, cycleDate: '2026-04-21' };
    localStorage.setItem('forecastData', JSON.stringify(serializeForecastWorkspace('severe', cycle, { center: [38.5, -97], zoom: 5 })));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-navbar__version');
  await page.evaluate(() => {
    document.querySelector('.app-navbar__version').textContent = 'v2';
    document.querySelectorAll('[data-testid="auto-tstm-disabled-banner"], [data-testid="categorical-error-banner"], [role="alert"]').forEach((element) => element.remove());
  });
  await page.waitForTimeout(9000);
}

async function capture(name) {
  await page.evaluate(() => {
    document.querySelectorAll('[role="alert"], [role="status"], [data-sonner-toast], [data-testid="auto-tstm-disabled-banner"], [data-testid="categorical-error-banner"], .gfc-categorical-error-banner').forEach((element) => element.remove());
  });
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  const data = await readFile(file);
  const webpData = await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return await new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        const buffer = await blob.arrayBuffer();
        resolve(Array.from(new Uint8Array(buffer)));
      }, 'image/webp', 0.82);
    });
  }, data.toString('base64'));
  await (await import('node:fs/promises')).writeFile(path.join(output, `${name}.webp`), Buffer.from(webpData));
  console.log(`${name}: ${(data.length / 1024).toFixed(0)} KB PNG`);
}

try {
  const mesoscaleOnly = process.env.GFC_CAPTURE_MESOSCALE_ONLY === 'true';
  if (!mesoscaleOnly) {
  await prepare('/forecast/severe');
  await page.waitForTimeout(9000);
  await capture('live-forecast-desktop');

  await seedTornadoOutlook();
  await capture('live-drawn-outlook-desktop');

  await prepare('/forecast/severe?surface=discussion');
  const guided = page.getByText('Guided', { exact: true }).first();
  if (await guided.count()) await guided.click();
  const discussionFields = {
    synopsis: 'A conditional severe threat is expected across the central Plains this afternoon and evening.',
    meteorologicalSetup: 'A strengthening low-level jet will bring rich moisture north beneath steepening midlevel lapse rates. A dryline sharpens from western Kansas into Oklahoma.',
    severeWeatherExpectations: 'Large hail and damaging winds are the primary concerns. A few tornadoes are possible where storms remain discrete.',
    timing: 'Storms may develop after 3 PM CDT, with the greatest coverage from 5 PM through 10 PM.',
    regionalBreakdown: 'The highest tornado potential is near the Kansas-Oklahoma border. Hail and wind risks extend east toward central Missouri.',
    additionalConsiderations: 'Cloud cover and early storm development could limit instability. Confidence in storm coverage remains moderate.',
  };
  for (const [field, value] of Object.entries(discussionFields)) {
    const input = page.locator(`[data-field="${field}"]`);
    if (await input.count()) await input.fill(value);
  }
  await capture('live-discussion-desktop');

  await prepare('/monitor');
  const radar = page.getByLabel('Radar source');
  if (await radar.count()) await radar.selectOption('mrms-conus');
  const radarProduct = page.getByLabel('Radar product');
  if (await radarProduct.count()) await radarProduct.selectOption('bref-qcd');
  const satellite = page.getByLabel('Satellite product');
  if (await satellite.count()) await satellite.selectOption('goes-visible');
  await page.waitForTimeout(12_000);
  await capture('live-monitor-desktop');

  await prepare('/verification');
  await capture('live-verification-desktop');
  }

  await prepare('/forecast/mesoscale');
  await page.getByTestId('mesoscale-page').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('heading', { name: 'On the map' }).waitFor({ state: 'visible', timeout: 60_000 });
  const cape = page.getByRole('button', { name: 'CAPE (surface)', exact: true });
  if (await cape.getAttribute('aria-pressed') !== 'true') await cape.click();
  await page.getByText('CAPE (surface)', { exact: true }).first().waitFor({ state: 'visible' });
  await page.waitForFunction(async () => {
    const map = document.querySelector('.ol-viewport');
    const canvas = map?.querySelector('canvas');
    if (!canvas || canvas.width === 0) return false;
    const response = await fetch('/mesoscale-demo/cape-surface.png?z=3&x=1&y=3');
    return response.ok;
  }, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await capture('mesoscale-desktop');

  if (!mesoscaleOnly) {
  // Regenerate the 8:5 marketing tiles from the current outlook and monitor screenshots.
  for (const [source, tile] of [['live-drawn-outlook-desktop.png', 'layers-tile-crop.jpg'], ['live-monitor-desktop.png', 'monitor-tile-crop.jpg']]) {
    const base64 = (await readFile(path.join(output, source))).toString('base64');
    const jpeg = await page.evaluate(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const targetWidth = Math.min(image.width, Math.round(image.height * 8 / 5));
      const targetHeight = Math.round(targetWidth * 5 / 8);
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 800;
      const context = canvas.getContext('2d');
      const sx = Math.max(0, (image.width - targetWidth) / 2);
      const sy = Math.max(0, (image.height - targetHeight) / 2);
      context.drawImage(image, sx, sy, targetWidth, targetHeight, 0, 0, 1280, 800);
      return await new Promise((resolve) => canvas.toBlob(async (blob) => resolve(Array.from(new Uint8Array(await blob.arrayBuffer()))), 'image/jpeg', 0.86));
    }, base64);
    await (await import('node:fs/promises')).writeFile(path.join(output, tile), Buffer.from(jpeg));
  }

  // Compose the social preview from the actual captured outlook screenshot.
  const outlook = (await readFile(path.join(output, 'live-drawn-outlook-desktop.png'))).toString('base64');
  const fontUrl = `${appUrl}/node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2`;
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<style>@font-face{font-family:Bricolage;src:url('${fontUrl}')}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#081522;color:white;font-family:Bricolage,Arial,sans-serif;display:flex;align-items:center;overflow:hidden}.copy{width:54%;padding:72px}.brand{font-size:24px;color:#a9c2d2;margin-bottom:46px}.title{font-size:56px;line-height:1.04;font-weight:700;letter-spacing:-1.5px;white-space:nowrap}.shot{position:absolute;right:-20px;width:55%;height:520px;object-fit:cover;object-position:center;border-radius:18px;box-shadow:0 24px 70px #0009;border:1px solid #ffffff30}</style><div class="copy"><div class="brand">Graphical Forecast Creator</div><div class="title">Create forecasts.<br>Your way.</div></div><img class="shot" src="data:image/png;base64,${outlook}">`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.shot').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(root, 'marketing/src/assets/og.png'), animations: 'disabled', scale: 'css' });
  }
} finally {
  await browser.close();
}
