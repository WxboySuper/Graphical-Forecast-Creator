import { anyFileMatches } from './glob-match.mjs';

/** @typedef {{ changedFiles: string[] }} ExposureContext */

// Exact file paths (no glob) — these are the canonical exposure registry files.
const REGISTRY_FILE_PATTERNS = [
  'src/config/featureExposure.ts',
];

// Test files for the registry — trigger registry-change but not production labels.
const REGISTRY_TEST_PATTERNS = [
  'src/config/featureExposure.test.ts',
];

// Exact file paths for server-side exposure and capability files.
const SERVER_EXPOSURE_FILE_PATTERNS = [
  'firestore.rules',
  'server/lib/serverFeatureExposure.js',
  'server/lib/featureCapabilities.js',
  'server/account-lifecycle.js',
];

// Client-side feature gating and surface configuration.
// Exact files cover flat-file layout; directory globs cover future index-based modules.
const FEATURE_GATING_FILE_PATTERNS = [
  'src/components/FeatureBoundary.tsx',
  'src/components/FeatureBoundary/**',
  'src/config/featureSurfaces.ts',
  'src/config/featureSurfaces/**',
  'src/config/featureNavigation.ts',
  'src/config/featureNavigation/**',
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

  const hasRegistryTestChange = REGISTRY_TEST_PATTERNS.some((pattern) =>
    anyFileMatches(changedFiles, pattern),
  );

  const hasServerExposureChange = SERVER_EXPOSURE_FILE_PATTERNS.some((pattern) =>
    anyFileMatches(changedFiles, pattern),
  );

  const hasGatingChange = FEATURE_GATING_FILE_PATTERNS.some((pattern) =>
    anyFileMatches(changedFiles, pattern),
  );

  const affectsProduction = hasRegistryChange || hasGatingChange || hasServerExposureChange;

  if (hasRegistryChange || hasRegistryTestChange) {
    labels.add('exposure:registry-change');
  }

  if (hasServerExposureChange) {
    labels.add('exposure:server-backed');
  }

  if (affectsProduction) {
    labels.add('exposure:production');
  }

  return labels;
};
