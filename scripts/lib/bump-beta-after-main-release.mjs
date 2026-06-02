import { deriveStableVersion, hasBetaPrerelease } from './package-version.mjs';

/**
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number, raw: string } | null}
 */
export function parseStableTriple(version) {
  const raw = deriveStableVersion(version) ?? version.trim();
  const parts = raw.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return null;
  }
  return { major: parts[0], minor: parts[1], patch: parts[2], raw };
}

/**
 * @param {{ major: number, minor: number, patch: number }} a
 * @param {{ major: number, minor: number, patch: number }} b
 * @returns {number} Negative if a < b, positive if a > b, zero if equal.
 */
export function compareStableTriples(a, b) {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

/**
 * Next development line after a stable release on main (e.g. 1.6.0 → 1.7.0-beta.1).
 * @param {{ major: number, minor: number }} mainStable
 */
export function nextBetaLineAfterStableRelease(mainStable) {
  return `${mainStable.major}.${mainStable.minor + 1}.0-beta.1`;
}

/**
 * Decides the beta package.json version after a stable release lands on main.
 * Preserves the current beta prerelease when main is still on an older stable line (patch/infra).
 * Resets to the next minor beta.1 only when main matches or passes the beta stable line.
 *
 * @param {string} mainStableVersion Stable semver on main (e.g. 1.5.3 or 1.6.0).
 * @param {string} currentBetaVersion package.json on beta before bump (e.g. 1.6.0-beta.14).
 * @returns {{ next: string, changed: boolean, reason: string }}
 */
export function computeBetaVersionAfterMainRelease(mainStableVersion, currentBetaVersion) {
  const main = parseStableTriple(mainStableVersion);
  if (!main) {
    throw new Error(`Invalid main stable version "${mainStableVersion}".`);
  }

  const betaStable = parseStableTriple(currentBetaVersion);
  if (!betaStable) {
    throw new Error(`Invalid beta version "${currentBetaVersion}".`);
  }

  if (!hasBetaPrerelease(currentBetaVersion)) {
    const cmp = compareStableTriples(main, betaStable);
    if (cmp < 0) {
      return {
        next: currentBetaVersion,
        changed: false,
        reason: 'main_stable_behind_beta_line',
      };
    }
    return {
      next: nextBetaLineAfterStableRelease(main),
      changed: true,
      reason: 'beta_was_stable',
    };
  }

  const cmp = compareStableTriples(main, betaStable);
  if (cmp < 0) {
    return {
      next: currentBetaVersion,
      changed: false,
      reason: 'main_stable_behind_beta_line',
    };
  }

  if (cmp === 0) {
    return {
      next: nextBetaLineAfterStableRelease(main),
      changed: true,
      reason: 'promoted_stable_line',
    };
  }

  return {
    next: nextBetaLineAfterStableRelease(main),
    changed: true,
    reason: 'main_stable_ahead_of_beta_line',
  };
}
