/**
 * Verifies directory-prefix, wildcard-prefix, and suffix matching behavior.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pathMatches } from './glob-match.mjs';

describe('glob-match', () => {
  it('matches directory prefixes', () => {
    assert.ok(pathMatches('src/components/Map/Foo.tsx', 'src/components/Map/**'));
  });

  it('matches wildcard directory prefixes', () => {
    assert.ok(pathMatches('src/components/OutlookPanel/x.ts', 'src/components/Outlook*/**'));
  });

  it('matches suffix globs', () => {
    assert.ok(pathMatches('docs/foo.md', '**/*.md'));
  });

  it('matches interior double-star globs across nested directories', () => {
    assert.ok(pathMatches('src/a/b/c.css', 'src/**/*.css'));
    assert.ok(pathMatches('src/a.css', 'src/**/*.css'));
    assert.ok(pathMatches('.github/a/b/doc.md', '.github/**/*.md'));
    assert.ok(pathMatches('.github/doc.md', '.github/**/*.md'));
  });

  it('does not let interior double-star globs cross path boundaries where a single star applies', () => {
    assert.equal(pathMatches('src/a/b/c.ts', 'src/**/*.css'), false);
    assert.equal(pathMatches('other/a/b/c.css', 'src/**/*.css'), false);
  });

  it('anchors suffix globs to a path segment boundary', () => {
    assert.ok(pathMatches('foo.ts', '**/foo.ts'));
    assert.ok(pathMatches('src/foo.ts', '**/foo.ts'));
    assert.equal(pathMatches('barfoo.ts', '**/foo.ts'), false);
    assert.equal(pathMatches('src/notfoo.ts', '**/foo.ts'), false);
  });
});
