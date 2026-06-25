import { anyFileMatches } from './glob-match.mjs';

/** @typedef {{ changedFiles: string[] }} ExposureContext */

// Exact file paths (no glob) — these are the canonical exposure registry files.
const REGISTRY_FILE_PATTERNS = [
  'src/config/featureExposure.ts',
];

// Exact file paths for server-side exposure and capability files.
const SERVER_EXPOSURE_FILE_PATTERNS = [
  'server/lib/serverFeatureExposure.js',
  'server/lib/featureCapabilities.js',
];

// Exact file paths for client-side feature gating and surface configuration.
const FEATURE_GATING_FILE_PATTERNS = [
  'src/components/FeatureBoundary.tsx',
  'src/config/featureSurfaces.ts',
  'src/config/featureNavigation.ts',
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

  const affectsProduction = hasRegistryChange || hasGatingChange || hasServerExposureChange;
  if (affectsProduction) {
    labels.add('exposure:production');
  }

  return labels;
};
