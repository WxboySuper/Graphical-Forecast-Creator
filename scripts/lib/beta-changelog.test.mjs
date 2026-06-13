import assert from 'node:assert/strict';
import test from 'node:test';
import {
  betaChangelogTouchesPr,
  extractBetaChangelogEntry,
  takeBetaChangelogEntries,
  upsertBetaChangelogEntry,
} from './beta-changelog.mjs';

const sample = '# Beta Changelog\n\n## Unreleased\n';

test('upserts and replaces one PR entry without duplicates', () => {
  const inserted = upsertBetaChangelogEntry(sample, 503, ['First note']);
  const updated = upsertBetaChangelogEntry(inserted, 503, ['Updated note']);
  assert.match(updated, /### PR #503[\s\S]*Updated note/);
  assert.doesNotMatch(updated, /First note/);
  assert.equal(updated.split('### PR #503').length - 1, 1);
});

test('validates the current PR entry and rejects another PR entry', () => {
  const changelog = upsertBetaChangelogEntry(sample, 503, ['Feature foundation']);
  assert.equal(betaChangelogTouchesPr(['CHANGELOG.beta.md'], changelog, 503).ok, true);
  assert.equal(betaChangelogTouchesPr(['CHANGELOG.beta.md'], changelog, 504).ok, false);
  assert.equal(betaChangelogTouchesPr(['CHANGELOG.beta.md'], changelog, 0).ok, false);
});

test('rejects missing, malformed, and duplicate entries', () => {
  assert.equal(betaChangelogTouchesPr([], sample, 503).ok, false);
  assert.equal(
    betaChangelogTouchesPr(
      ['CHANGELOG.beta.md'],
      `${sample}\n### PR #503\n\nNo bullet\n`,
      503,
    ).ok,
    false,
  );
  const duplicate = `${upsertBetaChangelogEntry(sample, 503, ['First'])}\n### PR #503\n\n- Second\n`;
  assert.equal(betaChangelogTouchesPr(['CHANGELOG.beta.md'], duplicate, 503).ok, false);
});

test('extracts and consolidates selected entries without discarding others', () => {
  const first = upsertBetaChangelogEntry(sample, 503, ['Foundation']);
  const changelog = upsertBetaChangelogEntry(first, 504, ['Governance']);
  assert.match(extractBetaChangelogEntry(changelog, 503) ?? '', /Foundation/);
  const result = takeBetaChangelogEntries(changelog, [503]);
  assert.deepEqual(result.entries, ['Foundation']);
  assert.doesNotMatch(result.changelog, /PR #503/);
  assert.match(result.changelog, /PR #504/);
});

test('requires valid content for generated entries and selected entries for consolidation', () => {
  assert.throws(() => upsertBetaChangelogEntry(sample, 0, ['Invalid PR']));
  assert.throws(() => upsertBetaChangelogEntry(sample, 503, []));
  assert.throws(() => takeBetaChangelogEntries(sample, [503]), /Missing beta changelog entry/);
});

test('does not confuse PR numbers that share a numeric prefix', () => {
  const with500 = upsertBetaChangelogEntry(sample, 500, ['Higher-numbered PR']);
  assert.equal(extractBetaChangelogEntry(with500, 50), null);
  assert.equal(betaChangelogTouchesPr(['CHANGELOG.beta.md'], with500, 50).ok, false);

  const withBoth = upsertBetaChangelogEntry(with500, 50, ['Lower-numbered PR']);
  assert.match(extractBetaChangelogEntry(withBoth, 50) ?? '', /Lower-numbered PR/);
  assert.match(extractBetaChangelogEntry(withBoth, 500) ?? '', /Higher-numbered PR/);
  assert.equal(betaChangelogTouchesPr(['CHANGELOG.beta.md'], withBoth, 50).ok, true);
});

test('preserves dollar substitution tokens when replacing an entry', () => {
  const inserted = upsertBetaChangelogEntry(sample, 503, ['Original']);
  const updated = upsertBetaChangelogEntry(inserted, 503, ['$& $1 $` $\' remain literal']);
  assert.match(updated, /\$& \$1 \$` \$' remain literal/);
});
