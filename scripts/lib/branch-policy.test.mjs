/**
 * Verifies allowed branch targets, including feature, hotfix, stable maintenance, and permissive main defaults.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateBranchPolicy } from './branch-policy.mjs';

describe('branch policy', () => {
  it('allows feature branches to the next-major main line', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'feature/foo' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });

  it('allows hotfix to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'hotfix/urgent' });
    assert.equal(result.ok, true);
  });

  it('allows the deployment config workflow fix to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'fix/deployment-config' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });

  it('allows the opencode workflow branch to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'add-opencode-workflow' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });

  it('allows a stable maintenance line to accept hotfixes', () => {
    const result = evaluateBranchPolicy({ baseRef: 'stable/1.6.x', headRef: 'hotfix/urgent' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'hotfix');
  });

  it('accepts a backport branch on a stable line and no longer routes ports into main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'stable/2.x', headRef: 'backport/1861-to-2.x' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'backport');
    assert.equal(evaluateBranchPolicy({ baseRef: 'main', headRef: 'port/1-to-main' }).kind, 'main-integration');
  });

  it('allows arbitrary source branch names to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'anything-at-all' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });
});