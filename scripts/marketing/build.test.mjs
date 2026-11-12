import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.mjs';
import { buildReleaseHtml } from './releases.mjs';
import { escapeHtml, parseFrontMatter, renderTemplate } from './template.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('template engine', () => {
  it('escapes values, keeps raw values, and expands partials', () => {
    const html = renderTemplate('{{> p}} {{ a }} {{{ b }}}', { a: '<x>', b: '<y>' }, { p: '[{{ a }}]' });
    assert.equal(html, '[&lt;x&gt;] &lt;x&gt; <y>');
  });

  it('fails on missing values and partials instead of rendering blanks', () => {
    assert.throws(() => renderTemplate('{{ missing }}', {}), /Missing template value/);
    assert.throws(() => renderTemplate('{{> nope}}', {}), /Missing partial/);
  });

  it('parses front matter and escapes quotes', () => {
    const { meta, body } = parseFrontMatter('---\ntitle: A: B\npath: /x\n---\n<p>hi</p>');
    assert.deepEqual(meta, { title: 'A: B', path: '/x' });
    assert.equal(body, '<p>hi</p>');
    assert.equal(escapeHtml('"\''), '&quot;&#39;');
  });
});

describe('release notes rendering', () => {
  it('escapes every release field so release data cannot inject markup', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gfc-releases-'));
    try {
      mkdirSync(path.join(root, 'marketing', 'src', 'data'), { recursive: true });
      writeFileSync(path.join(root, 'marketing', 'src', 'data', 'releases.json'), JSON.stringify([{ label: 'v9"><b>', title: '<script>alert(1)</script>', summary: '<img src=x onerror=alert(1)>', sections: [{ title: '<i>', body: '<u>', bullets: ['<s>'] }], improvements: [{ id: 'x', text: '<em>' }] }]));
      const html = buildReleaseHtml(root);
      const lowered = html.toLowerCase();
      for (const tag of ['<script', '<img', '<b>', '<i>', '<u>', '<s>', '<em>']) assert.ok(!lowered.includes(tag), `${tag} must be escaped`);
      assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('release data validation', () => {
  it('fails with a readable message when an entry is malformed', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gfc-releases-bad-'));
    try {
      mkdirSync(path.join(root, 'marketing', 'src', 'data'), { recursive: true });
      writeFileSync(path.join(root, 'marketing', 'src', 'data', 'releases.json'), JSON.stringify([{ title: 'No label' }]));
      assert.throws(() => buildReleaseHtml(root), /releases.json entry 0 needs a string "label"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('page front matter safety', () => {
  const build = (frontMatter) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gfc-fm-'));
    try {
      const src = path.join(root, 'marketing', 'src');
      for (const dir of ['pages', 'partials', 'data', 'styles', 'scripts']) mkdirSync(path.join(src, dir), { recursive: true });
      writeFileSync(path.join(src, 'data', 'site.json'), JSON.stringify({ siteUrl: 'https://example.test', description: 'd' }));
      writeFileSync(path.join(src, 'partials', 'layout.html'), '{{{ content }}}');
      writeFileSync(path.join(src, 'scripts', 'site.js'), '1');
      writeFileSync(path.join(src, 'scripts', 'theme.js'), '1');
      writeFileSync(path.join(src, 'pages', 'x.html'), ['---', ...frontMatter, '---', 'body'].join('\n'));
      for (const pkg of ['@fontsource-variable/bricolage-grotesque', '@fontsource/ibm-plex-mono', 'maplibre-gl']) {
        cpSync(path.join(ROOT, 'node_modules', pkg), path.join(root, 'node_modules', pkg), { recursive: true, dereference: true });
      }
      return buildSite({ root, outDir: path.join(root, 'out') });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('rejects parent segments and absolute values in routes, outputs, and markdown sources', () => {
    assert.throws(() => build(['title: x', 'path: /../evil']), /without ".." segments/);
    assert.throws(() => build(['title: x', 'path: /ok', 'output: ../../evil.html']), /output must be a relative path/);
    assert.throws(() => build(['title: x', 'path: /ok', 'markdown: ../secret.md']), /markdown must be a relative path/);
  });
});

describe('template lookups', () => {
  it('does not resolve inherited object members as values', () => {
    assert.throws(() => renderTemplate('{{ constructor }}', {}), /Missing template value/);
    assert.throws(() => renderTemplate('{{> toString}}', {}), /Missing partial/);
  });
});

describe('build safety', () => {
  it('refuses to clear the repository root, its parents, a filesystem root, or an unrelated folder', () => {
    assert.throws(() => buildSite({ root: ROOT, outDir: path.join(path.dirname(ROOT), 'unrelated-gfc-output') }), /Refusing to clear output directory/);
    assert.throws(() => buildSite({ root: ROOT, outDir: path.join(os.tmpdir(), 'not-ours', 'out') }), /Refusing to clear output directory/);
    assert.throws(() => buildSite({ root: ROOT, outDir: ROOT }), /Refusing to clear output directory/);
    assert.throws(() => buildSite({ root: ROOT, outDir: path.dirname(ROOT) }), /Refusing to clear output directory/);
    assert.throws(() => buildSite({ root: ROOT, outDir: path.parse(ROOT).root }), /Refusing to clear output directory/);
  });
});

describe('marketing site build', () => {
  let outDir;
  let routes;

  before(() => {
    outDir = mkdtempSync(path.join(os.tmpdir(), 'gfc-marketing-'));
    routes = buildSite({ root: ROOT, outDir });
  });

  after(() => rmSync(outDir, { recursive: true, force: true }));

  const read = (file) => readFileSync(path.join(outDir, file), 'utf8');

  it('renders every expected page to a clean-URL index file', () => {
    for (const route of ['/', '/features', '/learn', '/learn/getting-started', '/learn/experienced', '/pricing', '/updates', '/about', '/contact', '/terms', '/privacy']) {
      assert.ok(routes.includes(route), `${route} was not built`);
      assert.ok(existsSync(path.join(outDir, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`)), `${route} output missing`);
    }
    assert.ok(existsSync(path.join(outDir, '404.html')));
    assert.ok(!existsSync(path.join(outDir, '404', 'index.html')));
  });

  it('points app links at the app host and never at third-party CDNs', () => {
    const home = read('index.html');
    assert.match(home, /href="https:\/\/app\.gfcweather\.com"/);
    assert.doesNotMatch(home, /unpkg\.com/);
    for (const route of routes) {
      const file = route === '/404' ? '404.html' : route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
      assert.doesNotMatch(read(file), /\{\{/, `${route} has an unrendered placeholder`);
    }
  });

  it('keeps the flat version label and the contact address in shared content', () => {
    assert.match(read('contact/index.html'), /contact@gfcweather\.com/);
    assert.match(read('updates/index.html'), /A bigger forecast desk\./);
    assert.doesNotMatch(read('index.html'), /v1\.7\.8/);
  });

  it('renders legal pages from the repository policy files', () => {
    assert.match(read('terms/index.html'), /Terms of Service/);
    assert.match(read('privacy/index.html'), /Privacy/i);
  });

  it('writes a sitemap that excludes the 404 page and a robots file', () => {
    const sitemap = read('sitemap.xml');
    assert.ok(sitemap.includes('<loc>https://gfcweather.com/pricing/</loc>'));
    assert.doesNotMatch(sitemap, /404/);
    assert.match(read('robots.txt'), /Sitemap: https:\/\/gfcweather\.com\/sitemap\.xml/);
  });

  it('fingerprints CSS and scripts under /assets/h/', () => {
    assert.match(read('index.html'), /href="\/assets\/h\/site\.[0-9a-f]{10}\.css"/);
    assert.match(read('index.html'), /src="\/assets\/h\/site\.[0-9a-f]{10}\.js"/);
  });
});
