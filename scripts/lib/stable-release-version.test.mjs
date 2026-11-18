import assert from 'node:assert/strict';
import test from 'node:test';
import { decideStableReleaseVersion, updateProductionReleaseManifest } from './stable-release-version.mjs';

test('strips beta prerelease without a minor bump', () => {
  assert.deepEqual(decideStableReleaseVersion({ currentVersion: '2.0.0-beta.25', tagExists: false }), {
    version: '2.0.0', strategy: 'strip-beta', bump: false,
  });
});

test('keeps an untagged stable package version', () => {
  assert.deepEqual(decideStableReleaseVersion({ currentVersion: '2.0.0', tagExists: false }), {
    version: '2.0.0', strategy: 'initial-stable', bump: false,
  });
});

test('increments the minor after an already released stable version', () => {
  assert.deepEqual(decideStableReleaseVersion({ currentVersion: '2.9.0', tagExists: true }), {
    version: '2.10.0', strategy: 'next-minor', bump: true,
  });
});

test('rejects package versions outside the stable flat version scheme', () => {
  assert.throws(() => decideStableReleaseVersion({ currentVersion: '2.1.3', tagExists: false }), /requires X\.Y\.0/);
});

test('the release manifest follows the version and keeps its rollout settings', () => {
  const manifest = { releaseId: 'v2.0.0', version: '2.0.0', action: 'live', status: 'live', strategy: 'instant' };
  assert.deepEqual(updateProductionReleaseManifest(manifest, '2.1.0'), {
    releaseId: 'v2.1.0', version: '2.1.0', action: 'live', status: 'live', strategy: 'instant',
  });
  assert.deepEqual(updateProductionReleaseManifest(manifest, '2.0.0'), manifest);
});
