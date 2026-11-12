/**
 * Captures the Mesoscale workspace from the public beta site, which serves real
 * HRRR model fields (the local demo fixtures are placeholder imagery and must
 * not be used for marketing). It hides the beta chrome, sets the header version
 * label to a flat "v2", picks a layer, draws one area, and writes
 * marketing/src/assets/live/mesoscale-desktop.png.
 *   node scripts/marketing/capture-beta-mesoscale.mjs [layer name]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.GFC_CAPTURE_OUT ?? path.join(ROOT, 'marketing', 'src', 'assets', 'live', 'mesoscale-desktop.png');
const LAYER = process.argv[2] ?? 'Storm-relative helicity, 0–1 km';
const SITE = process.env.GFC_CAPTURE_URL ?? 'https://beta.gfcweather.com';

mkdirSync(path.dirname(OUT), { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
  await context.addInitScript(() => {
    localStorage.setItem('gfc-tos-accepted', '2');
    localStorage.setItem('gfc-privacy-policy-accepted', '2');
  });
  const page = await context.newPage();
  await page.goto(`${SITE}/forecast/mesoscale`, { waitUntil: 'load', timeout: 60000 });
  await page.getByRole('button', { name: 'Dismiss beta notice' }).click({ timeout: 20000 }).catch(() => undefined);
  await page.waitForSelector('text=CAPE (surface)', { timeout: 60000 });

  await page.getByRole('button', { name: LAYER, exact: true }).click();
  await page.getByRole('button', { name: /^Remove CAPE/ }).click().catch(() => undefined);
  await page.waitForTimeout(6000);

  // Draw one hazard area over the central Plains.
  await page.getByRole('button', { name: 'Draw a polygon' }).click();
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('The map canvas is not visible; the Mesoscale workspace did not finish loading');
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  for (const [fx, fy] of [[0.52, 0.5], [0.62, 0.46], [0.69, 0.55], [0.64, 0.66], [0.55, 0.64]]) {
    const [x, y] = at(fx, fy);
    await page.mouse.click(x, y);
    await page.waitForTimeout(250);
  }
  const [lastX, lastY] = at(0.55, 0.64);
  await page.mouse.dblclick(lastX, lastY);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Select and edit areas' }).click().catch(() => undefined);

  await page.getByRole('tab', { name: 'Data' }).click().catch(() => page.getByRole('button', { name: 'Data', exact: true }).click());
  await page.evaluate(() => {
    for (const button of document.querySelectorAll('button')) {
      if (button.textContent.trim() === 'Feedback') button.style.display = 'none';
    }
  });
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (/^v\d+( beta \d+)?$/i.test(node.textContent.trim())) node.textContent = 'v2';
    }
  });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT });
  process.stdout.write(`wrote ${OUT}\n`);
} finally {
  await browser.close();
}
