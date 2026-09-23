/**
 * Covers Markdown rendering, safe output paths, local links, and Mermaid markup.
 *
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectRepoFiles, pageHtml, pageSlug, renderMarkdown, sourceFiles } from './build-local-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Prefix generated pages use to reach repository files. */
const REPO_LINK_PREFIX = '../../../';

/** Extract every id attribute from rendered HTML. */
function collectIds(html) {
  return new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1]));
}

/** Extract every href attribute from rendered HTML. */
function collectHrefs(html) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

/** Extract every image src attribute from rendered HTML. */
function collectSrcs(html) {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((match) => match[1]);
}

/** Return whether a generated href is external and needs no local resolution. */
function isExternalHref(href) {
  return /^(?:https?:|mailto:)/i.test(href);
}

/** Render every source document into a slug-keyed corpus with its heading ids. */
async function buildCorpus() {
  const files = await sourceFiles();
  const pageMap = new Map(files.map((file) => [file.relative, pageSlug(file.relative)]));
  const repoFiles = await collectRepoFiles();
  const rendered = new Map();
  for (const file of files) {
    const markdown = await fs.readFile(file.absolute, 'utf8');
    rendered.set(pageSlug(file.relative), renderMarkdown(markdown, { sourcePath: file.relative, pageMap, repoFiles }));
  }
  const idsByPage = new Map([...rendered].map(([slug, html]) => [slug, collectIds(html)]));
  const slugToSource = new Map(files.map((file) => [pageSlug(file.relative), file]));
  return { rendered, idsByPage, slugToSource, repoFiles };
}

/** Report repository files missing behind a generated-site prefix link. */
function findRepoLinkFailures(source, href, repoFiles) {
  const target = href.slice(REPO_LINK_PREFIX.length).split('#')[0];
  if (repoFiles.has(target)) return [];
  return [`${source.relative}: missing repository file ${target}`];
}

/** Report an unknown page or a missing heading fragment on a same-site href. */
function findPageLinkFailures(source, href, pageIds, corpus) {
  const [page, fragment] = href.split('#', 2);
  if (!page) {
    if (fragment !== undefined && !pageIds.has(fragment)) return [`${source.relative}: missing local #${fragment}`];
    return [];
  }
  const targetIds = corpus.idsByPage.get(page);
  if (!targetIds) return [`${source.relative}: unknown page ${page}`];
  if (fragment !== undefined && !targetIds.has(fragment)) return [`${source.relative}: ${page} is missing #${fragment}`];
  return [];
}

/** Classify one generated href and return the failures it causes. */
function findHrefFailures(href, source, pageIds, corpus) {
  if (isExternalHref(href)) return [];
  if (href === '#') return [`${source.relative}: unsafe destination placeholder`];
  if (href.startsWith(REPO_LINK_PREFIX)) return findRepoLinkFailures(source, href, corpus.repoFiles);
  return findPageLinkFailures(source, href, pageIds, corpus);
}

/** Return every unresolved local link, image, and fragment on one generated page. */
function findPageFailures(slug, corpus) {
  const source = corpus.slugToSource.get(slug);
  const pageIds = corpus.idsByPage.get(slug);
  const failures = [];
  for (const href of collectHrefs(corpus.rendered.get(slug))) {
    failures.push(...findHrefFailures(href, source, pageIds, corpus));
  }
  for (const src of collectSrcs(corpus.rendered.get(slug))) {
    failures.push(...findHrefFailures(src, source, pageIds, corpus));
  }
  return failures;
}

describe('local documentation renderer', () => {
  test('renders headings, tasks, tables, and Mermaid fences', () => {
    const html = renderMarkdown('# Title\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```mermaid\nflowchart LR\n```');
    assert.match(html, /<h1 id="title">Title<\/h1>/);
    assert.match(html, /checked/);
    assert.match(html, /<table>/);
    assert.match(html, /class="mermaid"/);
  });

  test('rejects unsafe destinations before emitting HTML', () => {
    const html = renderMarkdown('[unsafe](javascript:alert(1)) [safe](https://example.com)');
    assert.doesNotMatch(html, /javascript:/i);
    assert.match(html, /href="https:\/\/example\.com"/);
  });

  test('resolves local Markdown links and preserves fragments', () => {
    const html = renderMarkdown('[target](../guide.md#setup)', {
      sourcePath: 'docs/plans/today.md',
      pageMap: new Map([['docs/guide.md', 'docs__guide.html']]),
    });
    assert.match(html, /href="docs__guide\.html#setup"/);
  });

  test('preserves query strings on external links and leaves unresolved query links alone', () => {
    const context = {
      sourcePath: 'docs/plans/today.md',
      pageMap: new Map([['docs/guide.md', 'docs__guide.html']]),
    };
    const external = renderMarkdown('[query](https://example.com/a?b=c#frag)', context);
    assert.match(external, /href="https:\/\/example\.com\/a\?b=c#frag"/);
    const unresolved = renderMarkdown('[raw](../guide.md?raw=1)', context);
    assert.match(unresolved, /href="\.\.\/guide\.md\?raw=1"/);
  });

  test('uses collision-free page slugs and loads Mermaid only when needed', () => {
    assert.notEqual(pageSlug('docs/a-b.md'), pageSlug('docs/a b.md'));
    assert.doesNotMatch(pageHtml('Plain', 'plain.md', '<p>Text</p>'), /mermaid\.esm/);
    assert.match(pageHtml('Diagram', 'diagram.md', '<pre class="mermaid">graph TD</pre>'), /mermaid\.esm/);
  });
  test('stamps heading anchors and suffixes duplicate headings', () => {
    const html = renderMarkdown('# Current guidance: Testing\n\nIntro.\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond.');
    assert.match(html, /<h1 id="current-guidance-testing">Current guidance: Testing<\/h1>/);
    assert.match(html, /<h2 id="notes">Notes<\/h2>/);
    assert.match(html, /<h2 id="notes-1">Notes<\/h2>/);
    const ids = collectIds(html);
    assert.ok(ids.has('current-guidance-testing'));
    assert.ok(ids.has('notes'));
    assert.ok(ids.has('notes-1'));
  });

  test('generates GitHub-like heading ids for markup and collapsed whitespace', () => {
    const html = renderMarkdown('# Hello   World\n\n## [Guide label](../guide.md)\n\n## `setup` **bold** *emph*\n\n## Hello   World');
    assert.match(html, /<h1 id="hello-world">/);
    assert.match(html, /<h2 id="guide-label">/);
    assert.match(html, /<h2 id="setup-bold-emph">/);
    assert.match(html, /<h2 id="hello-world-1">/);
  });

  test('resolves local image sources with repository-relative mapping', () => {
    const html = renderMarkdown('![diagram](../assets/diagram.png)', {
      sourcePath: 'docs/plans/today.md',
      pageMap: new Map(),
      repoFiles: new Set(['docs/assets/diagram.png']),
    });
    assert.match(html, /src="\.\.\/\.\.\/\.\.\/docs\/assets\/diagram\.png"/);
    assert.deepEqual(collectSrcs(html), ['../../../docs/assets/diagram.png']);
  });

  test('resolves local non-Markdown links against repository files', async () => {
    const repoFiles = await collectRepoFiles();
    const html = renderMarkdown('[registry](../../src/config/featureExposure.ts)', {
      sourcePath: 'docs/operations/example.md',
      pageMap: new Map(),
      repoFiles,
    });
    assert.match(html, /href="\.\.\/\.\.\/\.\.\/src\/config\/featureExposure\.ts"/);
    assert.ok(repoFiles.has('src/config/featureExposure.ts'));
  });

  test('includes every code boundary guide linked from docs/README.md in the page map', async () => {
    const files = await sourceFiles();
    const pageMap = new Map(files.map((file) => [file.relative, pageSlug(file.relative)]));
    const markdown = await fs.readFile(path.join(ROOT, 'docs', 'README.md'), 'utf8');
    const guideLinks = [...markdown.matchAll(/\]\((\.\.\/(?:src|server)\/[^)\s]+\.md(?:#[^)\s]*)?)\)/g)].map((match) => match[1]);
    assert.ok(guideLinks.length > 0, 'expected code boundary guides in docs/README.md');
    const targets = guideLinks.map((link) => path.posix.normalize(path.posix.join('docs', link.split('#', 1)[0])));
    assert.equal(new Set(targets).size, targets.length, 'duplicate code boundary guide entry');
    for (const [index, link] of guideLinks.entries()) {
      assert.ok(pageMap.has(targets[index]), `${link} is missing from the page map`);
    }
  });

  test('every local link, image, and fragment in the generated corpus resolves', async () => {
    const corpus = await buildCorpus();
    const failures = [];
    for (const slug of corpus.rendered.keys()) {
      failures.push(...findPageFailures(slug, corpus));
    }
    assert.deepEqual(failures, []);
  });
});
