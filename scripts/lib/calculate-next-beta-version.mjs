import { hasBetaPrerelease } from './package-version.mjs';

const BETA_VERSION_PATTERN = /^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$/;

/**
 * @param {string} version
 * @returns {{ base: string; beta: number } | null}
 */
const parseBetaVersion = (version) => {
  const match = version.match(BETA_VERSION_PATTERN);
  if (!match) return null;
  return { base: match[1], beta: Number(match[2]) };
};

/**
 * @param {string} tag e.g. v1.8.0-beta.5
 * @param {string} base e.g. 1.8.0
 * @returns {number | null}
 */
const betaNumberFromTag = (tag, base) => {
  const match = tag.match(new RegExp(`^v${base.replace(/\./g, '\\.')}-beta\\.([0-9]+)$`));
  return match ? Number(match[1]) : null;
};

/**
 * Resolve the beta version to release.
 *
 * @param {{
 *   packageVersion: string;
 *   betaTags: string[];
 *   explicitVersion?: string;
 *   taggedVersions?: Set<string>;
 * }} options
 * @returns {{ version: string; strategy: 'explicit' | 'retry-unpublished' | 'increment' }}
 */
export const calculateNextBetaVersion = ({
  packageVersion,
  betaTags,
  explicitVersion = '',
  taggedVersions = null,
}) => {
  const explicit = explicitVersion.trim();
  if (explicit) {
    if (!hasBetaPrerelease(explicit)) {
      throw new Error(`Explicit beta version must match X.Y.Z-beta.N, got "${explicit}".`);
    }
    return { version: explicit, strategy: 'explicit' };
  }

  const parsed = parseBetaVersion(packageVersion);
  let base;
  let currentBeta = null;
  if (parsed) {
    base = parsed.base;
    currentBeta = parsed.beta;
  } else if (/^[0-9]+\.[0-9]+\.[0-9]+$/.test(packageVersion)) {
    base = packageVersion;
  } else {
    throw new Error(`Unsupported main package version: ${packageVersion}`);
  }

  const tagSet = taggedVersions ?? new Set(betaTags);
  const tagsForBase = betaTags.filter((tag) => betaNumberFromTag(tag, base) !== null);
  const lastTagged = tagsForBase
    .map((tag) => betaNumberFromTag(tag, base))
    .filter((value) => value !== null)
    .sort((a, b) => a - b)
    .at(-1);

  if (
    currentBeta !== null
    && !tagSet.has(`v${packageVersion}`)
    && (lastTagged === undefined || currentBeta >= lastTagged)
  ) {
    return { version: packageVersion, strategy: 'retry-unpublished' };
  }

  const next = (lastTagged ?? 0) + 1;
  return { version: `${base}-beta.${next}`, strategy: 'increment' };
};
