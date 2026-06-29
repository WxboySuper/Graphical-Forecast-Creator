import { BUILD_TARGETS, type BuildTarget } from '../../config/buildTarget';
import type { FeatureExposureMatrix } from '../../config/featureExposure';
import * as featureExposure from '../../config/featureExposure';

export { BUILD_TARGETS };

export const ALL_TARGETS_OFF: FeatureExposureMatrix = {
  local: false,
  beta: false,
  staging: false,
  production: false,
};

export const ALL_TARGETS_ON: FeatureExposureMatrix = {
  local: true,
  beta: true,
  staging: true,
  production: true,
};

/** Returns a matrix with exactly one target enabled. */
export const singleTargetOn = (target: BuildTarget): FeatureExposureMatrix => ({
  local: target === 'local',
  beta: target === 'beta',
  staging: target === 'staging',
  production: target === 'production',
});

/** Runs a callback with a temporary build target, restoring the previous value afterward. */
export const runWithBuildTarget = <T>(target: BuildTarget, fn: () => T): T => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;
  globalThis.__GFC_BUILD_TARGET__ = target;

  try {
    return fn();
  } finally {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
  }
};

/** Mocks isFeatureExposedOnTarget to return values from the supplied matrix for one feature. */
export const mockFeatureExposureOnTarget = (
  feature: featureExposure.FeatureKey,
  matrix: FeatureExposureMatrix
): jest.SpyInstance => {
  return jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockImplementation(
    (requestedFeature, target) => {
      if (requestedFeature === feature) {
        return matrix[target];
      }

      return featureExposure.FEATURE_EXPOSURE_REGISTRY[requestedFeature].exposure[target];
    }
  );
};

/** Mocks both target and embedded build-target exposure helpers for one feature. */
export const mockFeatureExposure = (
  feature: featureExposure.FeatureKey,
  matrix: FeatureExposureMatrix
): { onTarget: jest.SpyInstance; exposed: jest.SpyInstance } => {
  const onTarget = mockFeatureExposureOnTarget(feature, matrix);
  const exposed = jest.spyOn(featureExposure, 'isFeatureExposed').mockImplementation((requestedFeature) => {
    if (requestedFeature === feature) {
      return matrix[globalThis.__GFC_BUILD_TARGET__ ?? 'local'];
    }

    return featureExposure.FEATURE_EXPOSURE_REGISTRY[requestedFeature].exposure[
      globalThis.__GFC_BUILD_TARGET__ ?? 'local'
    ];
  });

  return { onTarget, exposed };
};
