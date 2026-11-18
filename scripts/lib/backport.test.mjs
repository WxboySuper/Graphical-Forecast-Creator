import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backportBody, backportBranch, backportChangelogDeclaration, backportTitle, linesFromLabels, stableBranchForLine } from './backport.mjs';

describe('backport labels', () => {
  it('reads stable lines from backport-N.x labels only', () => {
    assert.deepEqual(linesFromLabels(['Bug', 'backport-2.x', 'backport-3.x', 'backport-2.x', 'backport', 'backport-2.1']), ['2.x', '3.x']);
    assert.deepEqual(linesFromLabels([]), []);
  });

  it('names the stable branch and backport branch', () => {
    assert.equal(stableBranchForLine('2.x'), 'stable/2.x');
    assert.equal(backportBranch(1861, '2.x'), 'backport/1861-to-2.x');
  });
});

describe('backport PR', () => {
  it('keeps the original title and drops its PR number suffix', () => {
    assert.equal(backportTitle('fix(map): clamp zoom (#1861)', 1861, '2.x'), 'fix(map): clamp zoom (backport #1861 to 2.x)');
  });

  it('carries a changelog waiver with its reason, and otherwise asks for a stable-lane entry', () => {
    assert.equal(backportChangelogDeclaration('Changelog-Impact: none\nChangelog-Reason: CI only'), 'Changelog-Impact: none\nChangelog-Reason: CI only');
    assert.equal(backportChangelogDeclaration('Changelog-Impact: beta'), 'Changelog-Impact: hotfix');
    assert.equal(backportChangelogDeclaration('Changelog-Impact: none'), 'Changelog-Impact: hotfix');
    assert.equal(backportChangelogDeclaration(''), 'Changelog-Impact: hotfix');
  });

  it('lists conflicted files and exactly one changelog declaration', () => {
    const clean = backportBody({ sourcePr: 7, sourceUrl: 'u', line: '2.x', sourceBody: 'Changelog-Impact: beta', conflicts: [] });
    assert.doesNotMatch(clean, /Conflicts to resolve/);
    assert.equal(clean.match(/^Changelog-Impact:/gm).length, 1);
    assert.match(clean, /Backport of #7/);

    const conflicted = backportBody({ sourcePr: 7, sourceUrl: 'u', line: '2.x', sourceBody: '', conflicts: ['src/a.ts', 'server/flags.json'] });
    assert.match(conflicted, /- `src\/a\.ts`/);
    assert.match(conflicted, /- `server\/flags\.json`/);
    assert.equal(conflicted.match(/^Changelog-Impact:/gm).length, 1);
  });
});
