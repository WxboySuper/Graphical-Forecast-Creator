/**
 * Static build for the gfcweather.com marketing site. It renders the pages in
 * marketing/src into marketing/dist, fingerprints CSS, JS and font files under
 * /assets/h/ (served as immutable by the marketing Worker), and emits the
 * sitemap, robots.txt and a 404 page. Run with `pnpm run marketing:build`.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { parseFrontMatter, renderTemplate } from './template.mjs';
import { buildReleaseHtml } from './releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const FONT_FILES = {
  __FONT_BRICOLAGE__: ['@fontsource-variable/bricolage-grotesque', 'files/bricolage-grotesque-latin-wght-normal.woff2'],
  __FONT_PLEX_400__: ['@fontsource/ibm-plex-mono', 'files/ibm-plex-mono-latin-400-normal.woff2'],
  __FONT_PLEX_500__: ['@fontsource/ibm-plex-mono', 'files/ibm-plex-mono-latin-500-normal.woff2'],
  __FONT_PLEX_600__: ['@fontsource/ibm-plex-mono', 'files/ibm-plex-mono-latin-600-normal.woff2'],
};

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
  let css = listFiles(path.join(srcDir, 'styles'), '.css')
    .map((name) => readText(srcDir, 'styles', name))
    .join('\n');
  for (const [token, url] of Object.entries(fontUrls)) css = css.split(token).join(url);
  return emitHashed(outDir, 'site', '.css', css);
};

const emitScripts = (outDir, srcDir) => {
  const urls = {};
  for (const name of listFiles(path.join(srcDir, 'scripts'), '.js')) {
    urls[path.basename(name, '.js')] = emitHashed(outDir, path.basename(name, '.js'), '.js', readText(srcDir, 'scripts', name));
  }
  return urls;
};

/** Copies the ESM maplibre-gl build (module, shared chunk, worker, CSS) into a versioned folder. */
const emitMaplibre = (outDir, root) => {
  const packageDir = path.join(root, 'node_modules', 'maplibre-gl');
  const { version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const target = path.join(outDir, 'assets', 'h', `maplibre-${version}`);
  mkdirSync(target, { recursive: true });
  for (const file of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
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

const pageOutputPath = (routePath) => (routePath === '/' ? 'index.html' : path.posix.join(routePath.replace(/^\//, ''), 'index.html'));

/** Builds the script, stylesheet, and module-preload tags that a page's front matter asks for. */
const pageAssetTags = (meta, globals) => {
  const isHome = meta.script === 'home';
  const script = meta.script ? globals.scripts[meta.script] : '';
  return {
    pageScript: script ? `<script src="${script}" defer></script>` : '',
    pageStyles: isHome ? `<link rel="stylesheet" href="${globals.maplibreCss}">` : '',
    pageVendor: isHome ? `<link rel="modulepreload" href="${globals.maplibreModule}">` : '',
  };
};

/** Renders one page file into the layout and returns its output record. */
const renderPage = ({ file, srcDir, root, partials, globals }) => {
  const { meta, body } = parseFrontMatter(readText(srcDir, 'pages', file));
  if (!meta.title || !meta.path) throw new Error(`${file} needs title and path front matter`);
  const content = body;
  const values = {
    ...globals,
    title: meta.title,
    description: meta.description ?? globals.defaultDescription,
    canonical: `${globals.siteUrl}${meta.path === '/' ? '/' : meta.path}`,
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
    .map((record) => `  <url><loc>${siteUrl}${record.route === '/' ? '/' : record.route}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
};

/** Builds the marketing site into outDir and returns the rendered page routes. */
export const buildSite = ({ root = ROOT, outDir = path.join(root, 'marketing', 'dist') } = {}) => {
  const srcDir = path.join(root, 'marketing', 'src');
  const site = JSON.parse(readText(srcDir, 'data', 'site.json'));
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
