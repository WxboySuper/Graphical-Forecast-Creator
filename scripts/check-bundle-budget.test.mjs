import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { entryChunkFromHtml, listJsChunks } from './check-bundle-budget.mjs';

describe('bundle budget entry resolution', () => {
  it('prefers the module script over an earlier classic script', () => {
    const html =
      '<script src="/legacy.js"></script><script type="module" crossorigin src="/assets/index-abc.js"></script>';
    assert.equal(entryChunkFromHtml(html), 'assets/index-abc.js');
  });

  it('resolves a base-prefixed script path to the build root', () => {
    const html = '<script type="module" src="/gfc/assets/index-abc.js"></script>';
    assert.equal(entryChunkFromHtml(html, '/gfc/'), 'assets/index-abc.js');
  });

  it('resolves an absolute base URL to the build root', () => {
    const html = '<script type="module" src="https://beta.example.test/assets/index-abc.js"></script>';
    assert.equal(entryChunkFromHtml(html, 'https://beta.example.test'), 'assets/index-abc.js');
  });

  it('ignores cross-origin and non-JS script tags', () => {
    const html =
      '<script src="https://cdn.example.test/analytics.js"></script>' +
      '<script type="module" src="/assets/index-abc.js?cache=1"></script>';
    assert.equal(entryChunkFromHtml(html), 'assets/index-abc.js');
  });

  it('returns null when no JavaScript entry exists', () => {
    assert.equal(entryChunkFromHtml('<script type="module" src="/assets/index.css"></script>'), null);
    assert.equal(entryChunkFromHtml('<div>no scripts</div>'), null);
  });
});

describe('bundle budget chunk discovery', () => {
  it('includes nested chunks and ignores non-JS files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfc-bundle-budget-'));
    try {
      mkdirSync(join(dir, 'chunks', 'nested'), { recursive: true });
      writeFileSync(join(dir, 'index.js'), '');
      writeFileSync(join(dir, 'index.css'), '');
      writeFileSync(join(dir, 'chunks', 'lazy.js'), '');
      writeFileSync(join(dir, 'chunks', 'nested', 'deep.js'), '');
      writeFileSync(join(dir, 'chunks', 'note.txt'), '');

      assert.deepEqual(listJsChunks(dir).sort(), [
        'chunks/lazy.js',
        'chunks/nested/deep.js',
        'index.js',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
