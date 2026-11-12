/**
 * Static build for the gfcweather.com marketing site. It renders the pages in
 * marketing/src into marketing/dist, fingerprints CSS, JS and font files under
 * /assets/h/ (served as immutable by the marketing Worker), and emits the
 * sitemap, robots.txt and a 404 page. Run with `pnpm run marketing:build`.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { parseFrontMatter, renderTemplate } from './template.mjs';
import { buildReleaseHtml } from './releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const FONT_FILES = {
  bricolage: ['@fontsource-variable/bricolage-grotesque', 'files/bricolage-grotesque-latin-wght-normal.woff2'],
  plex400: ['@fontsource/ibm-plex-mono', 'files/ibm-plex-mono-latin-400-normal.woff2'],
  plex500: ['@fontsource/ibm-plex-mono', 'files/ibm-plex-mono-latin-500-normal.woff2'],
  plex600: ['@fontsource/ibm-plex-mono', 'files/ibm-plex-mono-latin-600-normal.woff2'],
};

/** Builds the @font-face rules from the emitted, fingerprinted font URLs. */
const fontFaceCss = (urls) => [
  `@font-face{font-family:"Bricolage Grotesque";src:url(${urls.bricolage}) format("woff2");font-weight:200 800;font-display:swap}`,
  `@font-face{font-family:"IBM Plex Mono";src:url(${urls.plex400}) format("woff2");font-weight:400;font-display:swap}`,
  `@font-face{font-family:"IBM Plex Mono";src:url(${urls.plex500}) format("woff2");font-weight:500;font-display:swap}`,
  `@font-face{font-family:"IBM Plex Mono";src:url(${urls.plex600}) format("woff2");font-weight:600;font-display:swap}`,
].join('\n');

const hashOf = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);

const readText = (...parts) => readFileSync(path.join(...parts), 'utf8');

const listFiles = (dir, extension) =>
  existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(extension)).sort() : [];

/** Writes a fingerprinted asset and returns its public URL. */
const emitHashed = (outDir, name, extension, content) => {
  const fileName = `${name}.${hashOf(content)}${extension}`;
  mkdirSync(path.join(outDir, 'assets', 'h'), { recursive: true });
  writeFileSync(path.join(outDir, 'assets', 'h', fileName), content);
  return `/assets/h/${fileName}`;
};

/** Copies web fonts from their npm packages with content-hashed names. */
const emitFonts = (outDir, root) => {
  const urls = {};
  for (const [token, [pkg, file]] of Object.entries(FONT_FILES)) {
    const buffer = readFileSync(path.join(root, 'node_modules', pkg, file));
    const base = path.basename(file, '.woff2');
    urls[token] = emitHashed(outDir, base, '.woff2', buffer);
  }
  return urls;
};

const emitStyles = (outDir, srcDir, fontUrls) => {
  const css = [fontFaceCss(fontUrls), ...listFiles(path.join(srcDir, 'styles'), '.css').map((name) => readText(srcDir, 'styles', name))].join('\n');
  return emitHashed(outDir, 'site', '.css', css);
};

const emitScripts = (outDir, srcDir) => {
  const urls = {};
  for (const name of listFiles(path.join(srcDir, 'scripts'), '.js')) {
    urls[path.basename(name, '.js')] = emitHashed(outDir, path.basename(name, '.js'), '.js', readText(srcDir, 'scripts', name));
  }
  return urls;
};

const MAPLIBRE_FILES = ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css'];

/** Copies the ESM maplibre-gl build (module, shared chunk, worker, CSS) into a versioned folder. */
const emitMaplibre = (outDir, root) => {
  const packageDir = path.join(root, 'node_modules', 'maplibre-gl');
  const { version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const target = path.join(outDir, 'assets', 'h', `maplibre-${version}`);
  mkdirSync(target, { recursive: true });
  for (const file of MAPLIBRE_FILES) {
    if (!existsSync(path.join(packageDir, 'dist', file))) throw new Error(`maplibre-gl ${version} is missing dist/${file}; update MAPLIBRE_FILES in scripts/marketing/build.mjs`);
    cpSync(path.join(packageDir, 'dist', file), path.join(target, file));
  }
  const base = `/assets/h/maplibre-${version}`;
  return { maplibreModule: `${base}/maplibre-gl.mjs`, maplibreCss: `${base}/maplibre-gl.css` };
};

const loadPartials = (srcDir) => {
  const partials = {};
  for (const name of listFiles(path.join(srcDir, 'partials'), '.html')) {
    partials[path.basename(name, '.html')] = readText(srcDir, 'partials', name);
  }
  return partials;
};

/** Renders the Markdown source named in front matter (legal pages), or an empty string. */
const renderLegal = (meta, root) => (meta.markdown ? marked.parse(readText(root, meta.markdown), { gfm: true }) : '');

/** Public URL form of a route: pages are served as folders, so non-root routes end with a slash. */
const publicPath = (routePath) => (routePath === '/' || routePath.endsWith('/') ? routePath : `${routePath}/`);

const pageOutputPath = (routePath) => {
  if (routePath === '/') return 'index.html';
  if (routePath === '/404') return '404.html';
  return path.posix.join(routePath.slice(1), 'index.html');
};

/** Builds the script, stylesheet, and module-preload tags that a page's front matter asks for. */
const pageAssetTags = (meta, globals) => {
  const isHome = meta.script === 'home';
  const script = meta.script ? globals.scripts[meta.script] : '';
  if (meta.script && !script) throw new Error(`Unknown page script "${meta.script}"; add marketing/src/scripts/${meta.script}.js`);
  return {
    pageScript: script ? `<script src="${script}" defer></script>` : '',
    pageStyles: isHome ? `<link rel="stylesheet" href="${globals.maplibreCss}">` : '',
    pageVendor: isHome ? `<link rel="modulepreload" href="${globals.maplibreModule}">` : '',
  };
};

const hasParentSegment = (value) => value.split(/[\\/]/).includes('..');

const isSafeRoute = (value) => value.startsWith('/') && !hasParentSegment(value);

const isSafeRelative = (value) => !path.isAbsolute(value) && !hasParentSegment(value);

/** Rejects front matter that could read or write outside the repository or the output folder. */
const assertPageMeta = (meta, file) => {
  if (!isSafeRoute(meta.path)) throw new Error(`${file}: path must be an absolute route without ".." segments`);
  for (const key of ['output', 'markdown']) {
    if (meta[key] && !isSafeRelative(meta[key])) throw new Error(`${file}: ${key} must be a relative path without ".." segments`);
  }
};

/** Renders one page file into the layout and returns its output record. */
const renderPage = ({ file, srcDir, root, partials, globals }) => {
  const { meta, body } = parseFrontMatter(readText(srcDir, 'pages', file));
  if (!meta.title || !meta.path) throw new Error(`${file} needs title and path front matter`);
  const content = body;
  assertPageMeta(meta, file);
  const values = {
    ...globals,
    title: meta.title,
    description: meta.description ?? globals.defaultDescription,
    canonical: `${globals.siteUrl}${publicPath(meta.path)}`,
    canonicalTag: meta.noindex === 'true' ? '' : `<link rel="canonical" href="${globals.siteUrl}${publicPath(meta.path)}">`,
    bodyClass: meta.bodyClass ?? '',
    active: meta.active ?? '',
    ...pageAssetTags(meta, globals),
    legal: renderLegal(meta, root),
    releases: meta.generated === 'releases' ? buildReleaseHtml(root) : '',
    noindex: meta.noindex === 'true' ? '<meta name="robots" content="noindex">' : '',
  };
  const inner = renderTemplate(content, values, partials);
  const html = renderTemplate(partials.layout, { ...values, content: inner }, partials);
  const outputPath = meta.output ?? pageOutputPath(meta.path);
  return { outputPath, html, route: meta.path, indexed: meta.noindex !== 'true' };
};

const sitemapXml = (siteUrl, records) => {
  const urls = records
    .filter((record) => record.indexed)
    .map((record) => `  <url><loc>${siteUrl}${publicPath(record.route)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
};

const containsPath = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

/** Temp folders are only cleared when they sit inside a gfc-* scratch directory this tooling created. */
const isScratchDir = (target) => {
  const relative = path.relative(path.resolve(os.tmpdir()), target);
  return containsPath(path.resolve(os.tmpdir()), target) && path.basename(relative.split(path.sep)[0]).startsWith('gfc-');
};

/** Only clears an output folder strictly inside the repository or the OS temp directory. */
const assertSafeOutDir = (root, outDir) => {
  const resolved = path.resolve(outDir);
  const allowed = containsPath(path.resolve(root), resolved) || isScratchDir(resolved);
  if (!allowed) throw new Error(`Refusing to clear output directory outside the repository or temp folder: ${resolved}`);
};

/** Builds the marketing site into outDir and returns the rendered page routes. */
export const buildSite = ({ root = ROOT, outDir = path.join(root, 'marketing', 'dist') } = {}) => {
  const srcDir = path.join(root, 'marketing', 'src');
  const site = JSON.parse(readText(srcDir, 'data', 'site.json'));
  assertSafeOutDir(root, outDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const fontUrls = emitFonts(outDir, root);
  const globals = {
    ...site,
    defaultDescription: site.description,
    cssHref: emitStyles(outDir, srcDir, fontUrls),
    scripts: emitScripts(outDir, srcDir),
    ...emitMaplibre(outDir, root),
  };
  globals.siteScript = globals.scripts.site ?? '';
  globals.themeScript = globals.scripts.theme ?? '';
  if (!globals.siteScript || !globals.themeScript) throw new Error('marketing/src/scripts must contain site.js and theme.js');
  if (existsSync(path.join(srcDir, 'assets'))) cpSync(path.join(srcDir, 'assets'), path.join(outDir, 'assets', 'img'), { recursive: true });
  if (existsSync(path.join(root, 'public', 'favicon.ico'))) cpSync(path.join(root, 'public', 'favicon.ico'), path.join(outDir, 'favicon.ico'));
  const partials = loadPartials(srcDir);
  const records = listFiles(path.join(srcDir, 'pages'), '.html')
    .filter((file) => !file.startsWith('_'))
    .map((file) => renderPage({ file, srcDir, root, partials, globals }));
  for (const record of records) {
    const target = path.join(outDir, record.outputPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, record.html);
  }
  writeFileSync(path.join(outDir, 'sitemap.xml'), sitemapXml(site.siteUrl, records));
  writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.siteUrl}/sitemap.xml\n`);
  return records.map((record) => record.route);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = buildSite();
  process.stdout.write(`Built ${routes.length} marketing pages: ${routes.join(', ')}\n`);
}
