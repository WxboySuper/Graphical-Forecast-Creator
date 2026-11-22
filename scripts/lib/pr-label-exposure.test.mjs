/**
 * Verifies exposure labels derived from registry, registry-test, and server-capability file changes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exposureLabels } from './pr-label-exposure.mjs';

describe('exposureLabels', () => {
  it('applies exposure:registry-change when the flag registry is changed', () => {
    const labels = exposureLabels({ changedFiles: ['server/flags.json'] });
    assert.ok(labels.has('exposure:registry-change'));
  });

  it('applies exposure:registry-change but not exposure:production when only the registry test file is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/config/flags.baseline.test.tsx'] });
    assert.ok(labels.has('exposure:registry-change'));
    assert.ok(!labels.has('exposure:production'));
  });

  it('applies exposure:server-backed when the server flag reader is changed', () => {
    const labels = exposureLabels({ changedFiles: ['server/lib/flags.js'] });
    assert.ok(labels.has('exposure:server-backed'));
    assert.ok(labels.has('exposure:production'));
  });

  it('applies exposure:server-backed when featureCapabilities.js is changed', () => {
    const labels = exposureLabels({ changedFiles: ['server/lib/featureCapabilities.js'] });
    assert.ok(labels.has('exposure:server-backed'));
    assert.ok(labels.has('exposure:production'));
  });

  it('applies server-backed production exposure to the account lifecycle endpoint', () => {
    const labels = exposureLabels({ changedFiles: ['server/account-lifecycle.js'] });
    assert.ok(labels.has('exposure:server-backed'));
    assert.ok(labels.has('exposure:production'));
  });

  it('applies server-backed production exposure when Firestore rules change', () => {
    const labels = exposureLabels({ changedFiles: ['firestore.rules'] });
    assert.ok(labels.has('exposure:server-backed'));
    assert.ok(labels.has('exposure:production'));
  });

  it('does not apply exposure labels when featureCapabilities test is changed', () => {
    const labels = exposureLabels({ changedFiles: ['server/lib/featureCapabilities.test.js'] });
    assert.ok(!labels.has('exposure:server-backed'));
    assert.ok(!labels.has('exposure:production'));
  });

  it('applies exposure:production when the gated route table is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/routing/buildFeatureGatedRoutes.tsx'] });
    assert.ok(labels.has('exposure:production'));
    assert.ok(!labels.has('exposure:server-backed'));
  });

  it('applies exposure:production when feature navigation is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/config/featureNavigation.ts'] });
    assert.ok(labels.has('exposure:production'));
  });

  it('applies exposure:production when FeatureBoundary is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/features/FeatureBoundary.tsx'] });
    assert.ok(labels.has('exposure:production'));
  });

  it('applies exposure:production when ServerBackedFeatureBoundary is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/features/ServerBackedFeatureBoundary.tsx'] });
    assert.ok(labels.has('exposure:production'));
  });

  it('applies both exposure:registry-change and exposure:server-backed for combined changes', () => {
    const labels = exposureLabels({
      changedFiles: ['server/flags.json', 'server/lib/featureCapabilities.js'],
    });
    assert.ok(labels.has('exposure:registry-change'));
    assert.ok(labels.has('exposure:server-backed'));
    assert.ok(labels.has('exposure:production'));
  });

  it('applies no exposure labels for unrelated files', () => {
    const labels = exposureLabels({ changedFiles: ['src/App.tsx', 'docs/readme.md'] });
    assert.equal(labels.size, 0);
  });

  it('applies no exposure labels for empty changed files', () => {
    const labels = exposureLabels({ changedFiles: [] });
    assert.equal(labels.size, 0);
  });

  it('does not apply exposure labels for gating test files', () => {
    const testFiles = [
      'src/features/FeatureBoundary.test.tsx',
      'src/routing/buildFeatureGatedRoutes.test.tsx',
      'src/config/featureNavigation.test.ts',
    ];
    for (const file of testFiles) {
      const labels = exposureLabels({ changedFiles: [file] });
      assert.ok(!labels.has('exposure:production'), `exposure:production should not be produced for ${file}`);
    }
  });

  it('never applies exposure:beta-only for any file pattern', () => {
    const testCases = [
      ['server/flags.json'],
      ['server/lib/featureCapabilities.js'],
      ['src/features/FeatureBoundary.tsx'],
      ['src/routing/buildFeatureGatedRoutes.tsx'],
      ['src/config/featureNavigation.ts'],
    ];
    for (const changedFiles of testCases) {
      const labels = exposureLabels({ changedFiles });
      assert.ok(!labels.has('exposure:beta-only'), `exposure:beta-only should not be produced for ${changedFiles.join(', ')}`);
    }
  });
});