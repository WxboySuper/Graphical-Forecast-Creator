import { anyFileMatches } from './glob-match.mjs';

/** @typedef {{ changedFiles: string[] }} ExposureContext */

// Exact file paths (no glob) — these are the canonical exposure registry files.
const REGISTRY_FILE_PATTERNS = [
  'src/config/featureExposure.ts',
  'src/config/featureExposure.test.ts',
];

// Glob patterns for server-side exposure and capability files.
const SERVER_EXPOSURE_FILE_PATTERNS = [
  'server/lib/serverFeatureExposure.*',
  'server/lib/featureCapabilities.*',
];

// Glob patterns for client-side feature gating and surface configuration.
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
