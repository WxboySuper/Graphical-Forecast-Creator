import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareStableTriples,
  computeBetaVersionAfterMainRelease,
  nextBetaLineAfterStableRelease,
  parseStableTriple,
} from './bump-beta-after-main-release.mjs';

describe('bump-beta-after-main-release', () => {
  it('parseStableTriple accepts stable and beta versions', () => {
    assert.deepEqual(parseStableTriple('1.6.0-beta.14'), {
      major: 1,
      minor: 6,
      patch: 0,
      raw: '1.6.0',
    });
    assert.equal(parseStableTriple('1.5.3')?.raw, '1.5.3');
  });

  it('nextBetaLineAfterStableRelease bumps minor', () => {
    assert.equal(nextBetaLineAfterStableRelease({ major: 1, minor: 6 }), '1.7.0-beta.1');
  });

  it('preserves beta when main patch line is behind beta stable line', () => {
    const result = computeBetaVersionAfterMainRelease('1.5.3', '1.6.0-beta.14');
    assert.equal(result.changed, false);
    assert.equal(result.next, '1.6.0-beta.14');
    assert.equal(result.reason, 'main_stable_behind_beta_line');
  });

  it('starts next minor beta.1 after promoting the current beta line', () => {
    const result = computeBetaVersionAfterMainRelease('1.6.0', '1.6.0-beta.14');
    assert.equal(result.changed, true);
    assert.equal(result.next, '1.7.0-beta.1');
    assert.equal(result.reason, 'promoted_stable_line');
  });

  it('starts next minor beta.1 when beta was stable and main caught up', () => {
    const result = computeBetaVersionAfterMainRelease('1.6.0', '1.6.0');
    assert.equal(result.changed, true);
    assert.equal(result.next, '1.7.0-beta.1');
    assert.equal(result.reason, 'beta_was_stable');
  });

  it('starts next line when main stable is ahead of beta stable line', () => {
    const result = computeBetaVersionAfterMainRelease('1.7.0', '1.6.0-beta.14');
    assert.equal(result.changed, true);
    assert.equal(result.next, '1.8.0-beta.1');
    assert.equal(result.reason, 'main_stable_ahead_of_beta_line');
  });

  it('compareStableTriples orders semver by sign only', () => {
    const olderStable = parseStableTriple('1.5.3');
    const newerStable = parseStableTriple('1.6.0');
    assert.ok(olderStable && newerStable);
    assert.ok(compareStableTriples(olderStable, newerStable) < 0);
    assert.ok(compareStableTriples(newerStable, olderStable) > 0);
    assert.equal(compareStableTriples(olderStable, olderStable), 0);
  });
});
