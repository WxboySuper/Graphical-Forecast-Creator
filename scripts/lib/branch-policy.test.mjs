import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateBranchPolicy } from './branch-policy.mjs';

describe('branch policy', () => {
  it('allows beta promotion to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'beta' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'beta-promotion');
  });

  it('blocks feature branches to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'feature/foo' });
    assert.equal(result.ok, false);
  });

  it('allows hotfix to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'hotfix/urgent' });
    assert.equal(result.ok, true);
  });

  it('blocks fix branches to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'fix/deployment-config' });
    assert.equal(result.ok, false);
  });

  it('prioritizes feature to beta', () => {
    const result = evaluateBranchPolicy({ baseRef: 'beta', headRef: 'feature/foo' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'beta-integration-feature');
  });

  it('prioritizes fix to beta', () => {
    const result = evaluateBranchPolicy({ baseRef: 'beta', headRef: 'fix/foo' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'beta-integration-fix');
  });

  it('allows other branch names to beta', () => {
    const result = evaluateBranchPolicy({ baseRef: 'beta', headRef: 'chore/docs' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'beta-integration-other');
  });

  it('blocks hotfix to beta', () => {
    const result = evaluateBranchPolicy({ baseRef: 'beta', headRef: 'hotfix/urgent' });
    assert.equal(result.ok, false);
  });
});
