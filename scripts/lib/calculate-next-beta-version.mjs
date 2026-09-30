import { hasBetaPrerelease } from './package-version.mjs';

const BETA_VERSION_PATTERN = /^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$/;

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

const lastBetaNumberForBase = (betaTags, base) => {
  const numbers = betaTags
    .map((tag) => betaNumberFromTag(tag, base))
    .filter((value) => value !== null);
  if (!numbers.length) return undefined;
  return numbers.sort((a, b) => a - b).at(-1);
};

const assertExplicitVersionAllowed = ({ explicit, tagSet, betaTags, base }) => {
  if (tagSet.has(`v${explicit}`)) {
    throw new Error(`Explicit beta version v${explicit} is already tagged.`);
  }
  const parsed = parseBetaVersion(explicit);
  if (!parsed) {
    throw new Error(`Explicit beta version must match X.Y.Z-beta.N, got "${explicit}".`);
  }
  if (parsed.base !== base) {
    throw new Error(`Explicit beta version base ${parsed.base} does not match package base ${base}.`);
  }
  const lastTagged = lastBetaNumberForBase(betaTags, base);
  if (lastTagged !== undefined && parsed.beta <= lastTagged) {
    throw new Error(
      `Explicit beta version ${explicit} must be newer than the latest tag (beta.${lastTagged} for ${base}).`,
    );
  }
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
  const parsedPackage = parseBetaVersion(packageVersion);
  const base = parsedPackage?.base
    ?? (/^[0-9]+\.[0-9]+\.[0-9]+$/.test(packageVersion) ? packageVersion : null);
  if (!base) {
    throw new Error(`Unsupported main package version: ${packageVersion}`);
  }

  const tagSet = taggedVersions ?? new Set(betaTags);
  const lastTagged = lastBetaNumberForBase(betaTags, base);

  if (explicit) {
    if (!hasBetaPrerelease(explicit)) {
      throw new Error(`Explicit beta version must match X.Y.Z-beta.N, got "${explicit}".`);
    }
    assertExplicitVersionAllowed({ explicit, tagSet, betaTags, base });
    return { version: explicit, strategy: 'explicit' };
  }

  const currentBeta = parsedPackage?.beta ?? null;
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
