import { hasBetaPrerelease } from './package-version.mjs';

const BETA_VERSION_PATTERN = /^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$/;
const STABLE_BASE_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;

/**
 * @param {string} version
 * @returns {{ base: string; beta: number } | null}
 */
export const parseBetaVersion = (version) => {
  const match = version.match(BETA_VERSION_PATTERN);
  if (!match) return null;
  return { base: match[1], beta: Number(match[2]) };
};

/**
 * @param {string} tag e.g. v1.8.0-beta.5
 * @param {string} base e.g. 1.8.0
 * @returns {number | null}
 */
export const betaNumberFromTag = (tag, base) => {
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const parsed = parseBetaVersion(version);
  if (!parsed || parsed.base !== base) return null;
  return parsed.beta;
};

/** @param {string[]} betaTags @param {string} base */
export const lastBetaNumberForBase = (betaTags, base) => {
  const numbers = betaTags
    .map((tag) => betaNumberFromTag(tag, base))
    .filter((value) => value !== null);
  if (!numbers.length) return undefined;
  return numbers.sort((a, b) => a - b).at(-1);
};

/** @param {string} packageVersion */
export const resolveBetaVersionBase = (packageVersion) => {
  const parsed = parseBetaVersion(packageVersion);
  if (parsed) return parsed.base;
  if (STABLE_BASE_PATTERN.test(packageVersion)) return packageVersion;
  return null;
};

/** @param {string} explicit */
export const rejectInvalidExplicitBetaShape = (explicit) => {
  if (!hasBetaPrerelease(explicit)) {
    throw new Error(`Explicit beta version must match X.Y.Z-beta.N, got "${explicit}".`);
  }
};

/** @param {string} explicit @param {Set<string>} tagSet */
export const rejectTaggedExplicitVersion = (explicit, tagSet) => {
  if (tagSet.has(`v${explicit}`)) {
    throw new Error(`Explicit beta version v${explicit} is already tagged.`);
  }
};

/** @param {string} explicit @param {string} base */
export const rejectExplicitBaseMismatch = (explicit, base) => {
  const parsed = parseBetaVersion(explicit);
  if (!parsed) {
    throw new Error(`Explicit beta version must match X.Y.Z-beta.N, got "${explicit}".`);
  }
  if (parsed.base !== base) {
    throw new Error(`Explicit beta version base ${parsed.base} does not match package base ${base}.`);
  }
  return parsed;
};

/** @param {{ beta: number }} parsed @param {number | undefined} lastTagged @param {string} explicit @param {string} base */
export const rejectExplicitNotNewerThanLatestTag = (parsed, lastTagged, explicit, base) => {
  if (lastTagged !== undefined && parsed.beta <= lastTagged) {
    throw new Error(
      `Explicit beta version ${explicit} must be newer than the latest tag (beta.${lastTagged} for ${base}).`,
    );
  }
};

/** @param {string} explicit @param {string} packageVersion */
export const rejectExplicitLowerThanPackageVersion = (explicit, packageVersion) => {
  const explicitParsed = parseBetaVersion(explicit);
  const packageParsed = parseBetaVersion(packageVersion);
  if (!explicitParsed || !packageParsed || explicitParsed.base !== packageParsed.base) return;
  if (explicitParsed.beta < packageParsed.beta) {
    throw new Error(
      `Explicit beta version ${explicit} must not be lower than package.json (${packageVersion}).`,
    );
  }
};

/** @param {{ explicit: string; packageVersion: string; tagSet: Set<string>; betaTags: string[]; base: string }} input */
export const validateExplicitBetaVersion = ({ explicit, packageVersion, tagSet, betaTags, base }) => {
  rejectInvalidExplicitBetaShape(explicit);
  rejectTaggedExplicitVersion(explicit, tagSet);
  const parsed = rejectExplicitBaseMismatch(explicit, base);
  rejectExplicitLowerThanPackageVersion(explicit, packageVersion);
  const lastTagged = lastBetaNumberForBase(betaTags, base);
  rejectExplicitNotNewerThanLatestTag(parsed, lastTagged, explicit, base);
};

/** @param {{ packageVersion: string; tagSet: Set<string>; lastTagged: number | undefined }} input */
export const tryRetryUnpublishedPackageVersion = ({ packageVersion, tagSet, lastTagged }) => {
  const parsedPackage = parseBetaVersion(packageVersion);
  if (parsedPackage === null) return null;
  if (tagSet.has(`v${packageVersion}`)) return null;
  if (lastTagged !== undefined && parsedPackage.beta < lastTagged) return null;
  return packageVersion;
};

/**
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
  const base = resolveBetaVersionBase(packageVersion);
  if (!base) {
    throw new Error(`Unsupported main package version: ${packageVersion}`);
  }

  const tagSet = taggedVersions ?? new Set(betaTags);
  const lastTagged = lastBetaNumberForBase(betaTags, base);

  if (explicit) {
    validateExplicitBetaVersion({ explicit, packageVersion, tagSet, betaTags, base });
    return { version: explicit, strategy: 'explicit' };
  }

  const retry = tryRetryUnpublishedPackageVersion({ packageVersion, tagSet, lastTagged });
  if (retry) {
    return { version: retry, strategy: 'retry-unpublished' };
  }

  const next = (lastTagged ?? 0) + 1;
  return { version: `${base}-beta.${next}`, strategy: 'increment' };
};
