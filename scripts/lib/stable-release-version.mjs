const BETA_VERSION_PATTERN = /^(\d+)\.(\d+)\.0-beta\.\d+$/;
const STABLE_VERSION_PATTERN = /^(\d+)\.(\d+)\.0$/;

/** @param {{ currentVersion: string; tagExists: boolean }} input */
export const decideStableReleaseVersion = ({ currentVersion, tagExists }) => {
  const beta = currentVersion.match(BETA_VERSION_PATTERN);
  if (beta) {
    return { version: `${beta[1]}.${beta[2]}.0`, strategy: 'strip-beta', bump: false };
  }

  const stable = currentVersion.match(STABLE_VERSION_PATTERN);
  if (!stable) {
    throw new Error(`Stable release requires X.Y.0 or X.Y.0-beta.N, got "${currentVersion}".`);
  }
  if (!tagExists) return { version: currentVersion, strategy: 'initial-stable', bump: false };
  const nextMinor = Number(stable[2]) + 1;
  return { version: `${stable[1]}.${nextMinor}.0`, strategy: 'next-minor', bump: true };
};

/**
 * The release manifest describes the release being deployed: its id and version follow the package version,
 * and the rollout settings (action, status, strategy) are left as they are.
 * @param {Record<string, unknown>} manifest
 * @param {string} version
 */
export const updateProductionReleaseManifest = (manifest, version) => ({
  ...manifest,
  releaseId: `v${version}`,
  version,
});
