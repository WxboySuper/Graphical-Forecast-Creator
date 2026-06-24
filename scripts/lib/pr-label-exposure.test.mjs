import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exposureLabels } from './pr-label-exposure.mjs';

describe('exposureLabels', () => {
  it('applies exposure:registry-change when featureExposure.ts is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/config/featureExposure.ts'] });
    assert.ok(labels.has('exposure:registry-change'));
  });

  it('applies exposure:registry-change when featureExposure.test.ts is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/config/featureExposure.test.ts'] });
    assert.ok(labels.has('exposure:registry-change'));
  });

  it('applies exposure:server-backed when serverFeatureExposure.js is changed', () => {
    const labels = exposureLabels({ changedFiles: ['server/lib/serverFeatureExposure.js'] });
    assert.ok(labels.has('exposure:server-backed'));
  });

  it('applies exposure:server-backed when featureCapabilities.js is changed', () => {
    const labels = exposureLabels({ changedFiles: ['server/lib/featureCapabilities.js'] });
    assert.ok(labels.has('exposure:server-backed'));
  });

  it('applies exposure:server-backed when featureCapabilities.test.js is changed', () => {
    const labels = exposureLabels({ changedFiles: ['server/lib/featureCapabilities.test.js'] });
    assert.ok(labels.has('exposure:server-backed'));
  });

  it('applies exposure:production when feature surfaces are changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/config/featureSurfaces.ts'] });
    assert.ok(labels.has('exposure:production'));
    assert.ok(!labels.has('exposure:server-backed'));
  });

  it('applies exposure:production when feature navigation is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/config/featureNavigation.ts'] });
    assert.ok(labels.has('exposure:production'));
  });

  it('applies exposure:production when FeatureBoundary is changed', () => {
    const labels = exposureLabels({ changedFiles: ['src/components/FeatureBoundary.tsx'] });
    assert.ok(labels.has('exposure:production'));
  });

  it('applies both exposure:registry-change and exposure:server-backed for combined changes', () => {
    const labels = exposureLabels({
      changedFiles: ['src/config/featureExposure.ts', 'server/lib/featureCapabilities.js'],
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
});
