/**
 * Covers beta/stable version derivation and release-branch naming.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveStableVersion,
  evaluateVersionPolicy,
  hasBetaPrerelease,
  isReleasePromotionBranch,
  releaseBranchForStable,
} from './package-version.mjs';

describe('package-version policy', () => {
  it('detects beta prerelease', () => {
    assert.equal(hasBetaPrerelease('1.6.0-beta.1'), true);
    assert.equal(hasBetaPrerelease('1.6.0'), false);
  });

  it('derives stable from beta prerelease', () => {
    assert.equal(deriveStableVersion('1.6.0-beta.2'), '1.6.0');
    assert.equal(deriveStableVersion('1.6.0'), '1.6.0');
  });

  it('rejects prerelease suffixes that are not a numeric beta prerelease', () => {
    assert.equal(deriveStableVersion('1.6.0-beta'), null);
    assert.equal(deriveStableVersion('1.6.0-beta.foo'), null);
    assert.equal(deriveStableVersion('1.6.0-beta.1.2'), null);
    assert.equal(deriveStableVersion('1.6.0-rc.1'), null);
    assert.equal(deriveStableVersion('v1.6.0'), null);
  });

  it('builds release branch name', () => {
    assert.equal(releaseBranchForStable('1.6.0'), 'release/v1.6.0');
    assert.equal(isReleasePromotionBranch('release/v1.6.0'), true);
  });

  it('accepts the flat stable branch while retaining legacy stable lines', () => {
    assert.equal(evaluateVersionPolicy({ version: '2.1.0', targetBranch: 'stable/2.x' }).ok, true);
    assert.equal(evaluateVersionPolicy({ version: '1.7.7', targetBranch: 'stable/1.7.x' }).ok, true);
  });

  it('allows stable and beta versions on the main integration line', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0',
      targetBranch: 'main',
    });
    assert.equal(result.ok, true);
  });

  it('allows beta prereleases on the main integration line', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0-beta.1',
      targetBranch: 'main',
    });
    assert.equal(result.ok, true);
  });

  it('allows feature branches targeting main with beta version', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0-beta.1',
      targetBranch: 'main',
    });
    assert.equal(result.ok, true);
  });

  it('allows release branch PR to main with stable version', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0',
      targetBranch: 'main',
    });
    assert.equal(result.ok, true);
  });

  it('rejects arbitrary versions on main', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0.0',
      targetBranch: 'main',
    });
    assert.equal(result.ok, false);
  });

  it('requires stable versions on a stable release line', () => {
    const result = evaluateVersionPolicy({
      version: '1.7.0-beta.1',
      targetBranch: 'stable/1.6.x',
    });
    assert.equal(result.ok, false);
  });
});
