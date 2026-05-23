import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluatePortPrPolicy,
  isRedundantBetaPortPr,
  parsePortBranch,
  postMergeOwnsMainToBetaSync,
  targetBranchFromSlug,
} from './port-pr-policy.mjs';

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
    const result = evaluatePortPrPolicy({
      headRef: 'port/346-to-beta',
      baseRef: 'beta',
      targetBranch: 'beta',
      sourcePrHeadRef: 'feature/release-post-merge-github-release',
      sourcePrBaseRef: 'main',
      sourcePrNumber: 346,
    });
    assert.equal(result.ok, false);
  });

  it('allows hotfix ports into beta', () => {
    const result = evaluatePortPrPolicy({
      headRef: 'port/99-to-beta',
      baseRef: 'beta',
      targetBranch: 'beta',
      sourcePrHeadRef: 'hotfix/patch',
      sourcePrBaseRef: 'main',
      sourcePrNumber: 99,
    });
    assert.equal(result.ok, true);
  });
});
