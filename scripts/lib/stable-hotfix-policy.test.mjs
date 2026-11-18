/**
 * Stable-line PR policy: loose by design. A PR does not have to bump the version, update the manifest or
 * touch the changelog (the release workflow does), but it must not break them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateStableHotfixPolicy } from './stable-hotfix-policy.mjs';

const base = { baseRef: 'stable/2.x', basePackageVersion: '2.0.0', packageVersion: '2.0.0', manifestReleaseId: 'v2.0.0' };

test('a backport that changes neither version, manifest nor changelog is fine', () => {
  assert.deepEqual(evaluateStableHotfixPolicy(base), { ok: true, problems: [] });
});

test('a version bump on the same major is fine when the manifest follows it', () => {
  const result = evaluateStableHotfixPolicy({ ...base, packageVersion: '2.1.0', manifestReleaseId: 'v2.1.0' });
  assert.equal(result.ok, true);
});

test('rejects a version that goes backwards', () => {
  const result = evaluateStableHotfixPolicy({ ...base, basePackageVersion: '2.1.0', packageVersion: '2.0.0', manifestReleaseId: 'v2.0.0' });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /goes backwards/);
});

test('rejects a version on another major than the stable branch', () => {
  const result = evaluateStableHotfixPolicy({ ...base, packageVersion: '3.0.0', manifestReleaseId: 'v3.0.0' });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /not on the stable\/2\.x major/);
});

test('rejects a beta package version on a stable line', () => {
  const result = evaluateStableHotfixPolicy({ ...base, packageVersion: '2.1.0-beta.1' });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /stable semver/);
});

test('rejects a release manifest that no longer matches the package version', () => {
  const result = evaluateStableHotfixPolicy({ ...base, packageVersion: '2.1.0', manifestReleaseId: 'v2.0.0' });
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /releaseId must be v2\.1\.0/);
});

test('legacy stable/X.Y.x lines stay on their major.minor', () => {
  const legacy = { baseRef: 'stable/1.7.x', basePackageVersion: '1.7.7', packageVersion: '1.7.8', manifestReleaseId: 'v1.7.8' };
  assert.equal(evaluateStableHotfixPolicy(legacy).ok, true);
  assert.equal(evaluateStableHotfixPolicy({ ...legacy, packageVersion: '1.8.0', manifestReleaseId: 'v1.8.0' }).ok, false);
});
