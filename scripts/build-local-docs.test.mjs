import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectRepoFiles, pageHtml, pageSlug, renderMarkdown, sourceFiles } from './build-local-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Extract every id attribute from rendered HTML. */
function collectIds(html) {
  return new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1]));
}

/** Extract every href attribute from rendered HTML. */
function collectHrefs(html) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
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
    const guideLinks = [...markdown.matchAll(/\]\((\.\.\/(?:src|server)\/[^)]+\.md)\)/g)].map((match) => match[1]);
    assert.equal(guideLinks.length, 23);
    for (const link of guideLinks) {
      const target = path.posix.normalize(path.posix.join('docs', link));
      assert.ok(pageMap.has(target), `${link} is missing from the page map`);
    }
  });

  test('every local link and fragment in the generated corpus resolves', async () => {
    const files = await sourceFiles();
    const pageMap = new Map(files.map((file) => [file.relative, pageSlug(file.relative)]));
    const repoFiles = await collectRepoFiles();
    const slugToSource = new Map(files.map((file) => [pageSlug(file.relative), file]));
    const rendered = new Map();
    for (const file of files) {
      const markdown = await fs.readFile(file.absolute, 'utf8');
      rendered.set(pageSlug(file.relative), renderMarkdown(markdown, { sourcePath: file.relative, pageMap, repoFiles }));
    }

    const failures = [];
    for (const [slug, html] of rendered) {
      const source = slugToSource.get(slug);
      const ids = collectIds(html);
      for (const href of collectHrefs(html)) {
        if (/^(?:https?:|mailto:)/i.test(href)) continue;
        if (href === '#') { failures.push(`${source.relative}: unsafe destination placeholder`); continue; }
        if (href.startsWith('../../../')) {
          const target = href.slice('../../../'.length).split('#')[0];
          if (!repoFiles.has(target)) failures.push(`${source.relative}: missing repository file ${target}`);
          continue;
        }
        const [page, fragment] = href.split('#', 2);
        if (!page) {
          if (fragment !== undefined && !ids.has(fragment)) failures.push(`${source.relative}: missing local #${fragment}`);
          continue;
        }
        const targetHtml = rendered.get(page);
        if (!targetHtml) { failures.push(`${source.relative}: unknown page ${page}`); continue; }
        if (fragment !== undefined && !collectIds(targetHtml).has(fragment)) {
          failures.push(`${source.relative}: ${page} is missing #${fragment}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });
});
