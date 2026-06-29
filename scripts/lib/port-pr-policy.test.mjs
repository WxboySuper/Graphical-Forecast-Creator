import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluatePortPrPolicy,
  isRedundantBetaPortPr,
  parsePortBranch,
  postMergeOwnsMainToBetaSync,
  targetBranchFromSlug,
} from './port-pr-policy.mjs';

const evaluateBetaPortPr = ({
  headRef,
  sourcePrHeadRef,
  sourcePrNumber,
  betaContainsMain,
}) =>
  evaluatePortPrPolicy({
    headRef,
    baseRef: 'beta',
    targetBranch: 'beta',
    sourcePrHeadRef,
    sourcePrBaseRef: 'main',
    sourcePrNumber,
    ...(betaContainsMain === undefined ? {} : { betaContainsMain }),
  });

describe('port PR policy', () => {
  it('parses port branch names', () => {
    assert.deepEqual(parsePortBranch('port/346-to-beta'), {
      sourcePrNumber: 346,
      targetSlug: 'beta',
    });
    assert.deepEqual(parsePortBranch('port/346-to-feature-dependabot-changelog-skip'), {
      sourcePrNumber: 346,
      targetSlug: 'feature-dependabot-changelog-skip',
    });
  });

  it('decodes target slugs', () => {
    assert.equal(targetBranchFromSlug('beta'), 'beta');
    assert.equal(
      targetBranchFromSlug('feature-dependabot-changelog-skip'),
      'feature/dependabot-changelog-skip',
    );
  });

  it('knows which main merges post-merge syncs to beta', () => {
    assert.equal(postMergeOwnsMainToBetaSync('beta'), true);
    assert.equal(postMergeOwnsMainToBetaSync('release/v1.0.0'), true);
    assert.equal(postMergeOwnsMainToBetaSync('feature/release-post-merge-github-release'), true);
    assert.equal(postMergeOwnsMainToBetaSync('hotfix/urgent'), false);
  });

  it('detects redundant beta port PRs', () => {
    assert.equal(
      isRedundantBetaPortPr({
        targetBranch: 'beta',
        baseRef: 'beta',
        sourcePrBaseRef: 'main',
        sourcePrHeadRef: 'feature/release-post-merge-github-release',
      }),
      true,
    );
    assert.equal(
      isRedundantBetaPortPr({
        targetBranch: 'beta',
        baseRef: 'beta',
        sourcePrBaseRef: 'main',
        sourcePrHeadRef: 'hotfix/patch',
      }),
      false,
    );
  });

  it('blocks redundant port PR into beta after release infrastructure merge', () => {
    const result = evaluateBetaPortPr({
      headRef: 'port/346-to-beta',
      sourcePrHeadRef: 'feature/release-post-merge-github-release',
      sourcePrNumber: 346,
    });
    assert.equal(result.ok, false);
  });

  it('allows hotfix ports into beta', () => {
    const result = evaluateBetaPortPr({
      headRef: 'port/99-to-beta',
      sourcePrHeadRef: 'hotfix/patch',
      sourcePrNumber: 99,
    });
    assert.equal(result.ok, true);
  });

  it('allows release ports into beta when post-merge sync has not landed', () => {
    const result = evaluateBetaPortPr({
      headRef: 'port/421-to-beta',
      sourcePrHeadRef: 'release/v1.0.0',
      sourcePrNumber: 421,
      betaContainsMain: false,
    });
    assert.equal(result.ok, true);
  });
});
