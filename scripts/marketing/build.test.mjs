import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.mjs';
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
    assert.match(sitemap, /<loc>https:\/\/gfcweather\.com\/pricing<\/loc>/);
    assert.doesNotMatch(sitemap, /404/);
    assert.match(read('robots.txt'), /Sitemap: https:\/\/gfcweather\.com\/sitemap\.xml/);
  });

  it('fingerprints CSS and scripts under /assets/h/', () => {
    assert.match(read('index.html'), /href="\/assets\/h\/site\.[0-9a-f]{10}\.css"/);
    assert.match(read('index.html'), /src="\/assets\/h\/site\.[0-9a-f]{10}\.js"/);
  });
});
