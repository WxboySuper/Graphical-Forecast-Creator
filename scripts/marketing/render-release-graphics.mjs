/**
 * Renders the release graphics used on the What's new page, in the style of the
 * GFC announcement graphics: a light gradient, a pill badge, a very large
 * headline, a browser mock of the product, and the GFC lockup. Each card is
 * HTML rasterized with Playwright from the screenshots in marketing/src/assets.
 *   node scripts/marketing/render-release-graphics.mjs v2
 * Output goes to marketing/src/assets/updates/<release>/ as 1920x1080 JPEGs.
 */
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = path.join(ROOT, 'marketing', 'src', 'assets');
const LIVE = path.join(ASSETS, 'live');

const fontUrl = (pkg, file) => pathToFileURL(path.join(ROOT, 'node_modules', pkg, 'files', file)).href;

const ICONS = {
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7M3 20h18"/>',
  upload: '<path d="M12 15V4M8 8l4-4 4 4M5 15v4h14v-4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-5"/>',
};

const CSS = `
@font-face{font-family:"Bricolage Grotesque";src:url(${fontUrl('@fontsource-variable/bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2')});font-weight:200 800}
*{box-sizing:border-box}html,body{margin:0}
body{width:1920px;height:1080px;overflow:hidden;font-family:"Bricolage Grotesque",sans-serif;color:#0b1220;position:relative;
 background:radial-gradient(70% 80% at 85% 20%,#e4efff 0%,transparent 60%),linear-gradient(135deg,#ffffff 0%,#f1f6ff 100%)}
.badge{position:absolute;left:110px;top:88px;height:62px;padding:0 30px;border-radius:999px;background:#1f6bf2;color:#fff;display:flex;align-items:center;gap:14px;
 font-weight:700;font-size:28px;letter-spacing:.16em;text-transform:uppercase;box-shadow:0 14px 34px rgba(31,107,242,.3)}
.badge svg{width:30px;height:30px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.copy{position:absolute;left:110px;top:190px;width:880px}
h1.small{font-size:122px}
h1{margin:0;font-size:152px;line-height:.98;letter-spacing:-.045em;font-weight:800}
h1 em{font-style:normal;background:linear-gradient(90deg,#1f6bf2,#1fb6f5);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{margin:30px 0 0;font-size:44px;line-height:1.3;color:#3d4b66;max-width:760px}
.sub b{color:#0b1220}
.cta{position:absolute;left:110px;top:748px;height:92px;padding:0 42px;border-radius:18px;background:#1f6bf2;color:#fff;display:flex;align-items:center;gap:20px;font-size:44px;font-weight:700;box-shadow:0 22px 46px rgba(31,107,242,.34)}
.cta svg{width:42px;height:42px;stroke:#fff;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.points{position:absolute;left:110px;top:880px;display:flex;gap:44px;font-size:28px;font-weight:600;color:#1b2a4a}
.points span{display:flex;align-items:center;gap:12px}
.points svg{width:34px;height:34px;stroke:#1f6bf2;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lockup{position:absolute;left:96px;top:962px;height:96px}
.browser{position:absolute;left:1000px;top:200px;width:830px;height:520px;border-radius:26px;background:#fff;overflow:hidden;
 box-shadow:0 40px 90px rgba(11,18,32,.22),0 0 0 1px rgba(11,18,32,.1)}
.bar{height:50px;background:#eef2f9;display:flex;align-items:center;gap:10px;padding:0 20px;border-bottom:1px solid #dde4f0}
.bar i{width:14px;height:14px;border-radius:50%;background:#cfd6e4}
.url{margin-left:24px;height:32px;border-radius:999px;background:#fff;padding:0 22px;display:flex;align-items:center;font-size:19px;color:#1b2a4a;box-shadow:inset 0 0 0 1px #dde4f0}
.view{position:absolute;left:0;right:0;top:50px;bottom:0;overflow:hidden}
.view img{position:absolute;left:0;top:0;width:100%;height:auto;display:block}
.float{position:absolute;left:1380px;top:560px;width:470px;height:300px;border-radius:22px;background:#fff;overflow:hidden;
 box-shadow:0 36px 80px rgba(11,18,32,.28),0 0 0 1px rgba(11,18,32,.1)}
.float img{position:absolute;display:block;max-width:none}
`;

const FEATURES = {
  check: 'check', chart: 'chart', upload: 'upload', layers: 'layers', map: 'map', edit: 'edit', radar: 'radar',
};

const CARDS = {
  v2: [
    { file: 'hero', titleClass: 'small', icon: 'layers', badge: 'GFC v2', title: 'A bigger<br><em>forecast desk.</em>', sub: 'Mesoscale analysis, forecast workspaces, and a calmer severe discussion.', cta: 'gfcweather.com', points: [['check', 'Always free to forecast'], ['radar', 'Mesoscale analysis'], ['edit', 'Built with forecasters']], shot: { file: 'live-drawn-outlook-desktop.jpg', y: -50 }, float: { file: 'live-verification-desktop.png', width: 1500, x: -1160, y: -195 } },
    { file: 'mesoscale', icon: 'radar', badge: 'New workspace', title: 'Analyze<br>the <em>setup.</em>', sub: 'HRRR, RAP, and RRFS fields by run and forecast hour, with <b>your own areas</b> drawn on top.', points: [['layers', 'Model fields'], ['map', 'Draw hazard areas'], ['check', 'Radar and satellite context']], shot: { file: 'mesoscale-desktop.png', y: 0 } },
    { file: 'workspaces', icon: 'layers', badge: 'Workspaces', title: 'Organized<br>by <em>workspace.</em>', sub: 'Autosave, restore, and cloud saves follow the product you are working on.', points: [['check', 'Severe outlooks'], ['edit', 'Custom layers'], ['radar', 'Mesoscale']], shot: { file: 'live-drawn-outlook-desktop.jpg', y: -50 } },
    { file: 'discussion', icon: 'edit', badge: 'Severe discussion', title: 'Map and words,<br><em>together.</em>', sub: 'Edit the outlook and the discussion side by side, then review and export.', points: [['map', 'Map'], ['edit', 'Discussion'], ['upload', 'Review and export']], shot: { file: 'live-discussion-desktop.png', y: 0 } },
  ],
};

const mime = (file) => (file.endsWith('.png') ? 'image/png' : 'image/jpeg');
const dataUri = (file) => `data:${mime(file)};base64,${readFileSync(path.join(file.includes('lockup') ? ASSETS : LIVE, file)).toString('base64')}`;
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[FEATURES[name]]}</svg>`;

const floatHtml = (card) =>
  card.float
    ? `<div class="float"><img src="${dataUri(card.float.file)}" style="width:${card.float.width}px;left:${card.float.x}px;top:${card.float.y}px" alt=""></div>`
    : '';

const ctaHtml = (card) => (card.cta ? `<div class="cta">${card.cta}<svg viewBox="0 0 24 24">${'<path d="M5 12h14M13 6l6 6-6 6"/>'}</svg></div>` : '');

const cardHtml = (card) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="badge">${icon(card.icon)}${card.badge}</div>
<div class="copy"><h1 class="${card.titleClass ?? ''}">${card.title}</h1><p class="sub">${card.sub}</p></div>
${ctaHtml(card)}
<div class="points">${card.points.map(([name, label]) => `<span>${icon(name)}${label}</span>`).join('')}</div>
<img class="lockup" src="${dataUri('brand-lockup.png')}" alt="">
<div class="browser"><div class="bar"><i></i><i></i><i></i><div class="url">gfcweather.com</div></div>
<div class="view"><img src="${dataUri(card.shot.file)}" style="top:${card.shot.y}px" alt=""></div></div>
${floatHtml(card)}`;

const release = process.argv[2] ?? 'v2';
const cards = CARDS[release];
if (!cards) throw new Error(`No graphics defined for ${release}`);
const outDir = path.join(ROOT, 'marketing', 'src', 'assets', 'updates', release);
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gfc-graphics-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const card of cards) {
    if (!existsSync(path.join(LIVE, card.shot.file))) { process.stdout.write(`skip ${card.file}: ${card.shot.file} missing\n`); continue; }
    const htmlFile = path.join(tmp, `${card.file}.html`);
    writeFileSync(htmlFile, cardHtml(card));
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, `${card.file}.jpg`), type: 'jpeg', quality: 90 });
    process.stdout.write(`rendered ${card.file}\n`);
  }
} finally {
  await browser.close();
}
