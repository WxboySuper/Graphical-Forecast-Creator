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
});
