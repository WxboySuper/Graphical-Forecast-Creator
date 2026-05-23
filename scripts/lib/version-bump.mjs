import { deriveStableVersion, hasBetaPrerelease } from './package-version.mjs';

/**
 * @param {string} version
 * @returns {string | null}
 */
export const incrementBetaPrerelease = (version) => {
  const match = version.match(/^(\d+\.\d+\.\d+)-beta\.(\d+)$/i);
  if (match) {
    const next = Number(match[2]) + 1;
    return `${match[1]}-beta.${next}`;
  }

  const stable = deriveStableVersion(version);
  if (stable) {
    return `${stable}-beta.1`;
  }

  return null;
};

/**
 * @param {string} version
 * @returns {string | null}
 */
export const incrementPatchVersion = (version) => {
  const stable = deriveStableVersion(version) ?? version;
  const parts = stable.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
};

/**
 * @param {string} version
 * @param {'beta' | 'main'} target
 */
export const bumpVersionForMergeTarget = (version, target) => {
  if (target === 'beta') {
    return incrementBetaPrerelease(version);
  }
  if (target === 'main' && !hasBetaPrerelease(version)) {
    return incrementPatchVersion(version);
  }
  return null;
};
