import { anyFileMatches } from './glob-match.mjs';

/** @typedef {{ changedFiles: string[] }} ExposureContext */

const REGISTRY_FILE_PATTERNS = [
  'src/config/featureExposure.ts',
  'src/config/featureExposure.test.ts',
];

const SERVER_EXPOSURE_FILE_PATTERNS = [
  'server/lib/serverFeatureExposure.*',
  'server/lib/featureCapabilities.*',
];

const FEATURE_GATING_FILE_PATTERNS = [
  'src/components/FeatureBoundary.*',
  'src/config/featureSurfaces.*',
  'src/config/featureNavigation.*',
];

/**
 * Compute exposure-related labels for a PR based on changed files.
 *
 * @param {ExposureContext} context
 * @returns {Set<string>}
 */
export const exposureLabels = ({ changedFiles }) => {
  const labels = new Set();

  const hasRegistryChange = REGISTRY_FILE_PATTERNS.some((pattern) =>
    anyFileMatches(changedFiles, pattern),
  );

  const hasServerExposureChange = SERVER_EXPOSURE_FILE_PATTERNS.some((pattern) =>
    anyFileMatches(changedFiles, pattern),
  );

  const hasGatingChange = FEATURE_GATING_FILE_PATTERNS.some((pattern) =>
    anyFileMatches(changedFiles, pattern),
  );

  if (hasRegistryChange) {
    labels.add('exposure:registry-change');
  }

  if (hasServerExposureChange) {
    labels.add('exposure:server-backed');
  }

  if (hasRegistryChange || hasGatingChange) {
    labels.add('exposure:production');
  }

  return labels;
};
