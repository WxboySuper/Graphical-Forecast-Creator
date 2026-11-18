/**
 * Policy for pull requests into a stable line. The release workflow infers the next version, moves the
 * changelog lane and updates the release manifest at release time, so a PR (a backport, a hotfix) does not
 * have to touch any of them. What stays enforced is only what would break production if it were wrong:
 * the version must stay a stable semver on the line's major (and never go backwards), and the release
 * manifest must still describe the package version.
 */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** @returns {number[] | null} [major, minor, patch] */
const parse = (version) => {
  const match = String(version).match(SEMVER);
  return match ? match.slice(1).map(Number) : null;
};

/** True when `next` is a newer version than `previous` (both parsed). */
const isNewer = (next, previous) => {
  const index = [0, 1, 2].find((position) => next[position] !== previous[position]);
  return index !== undefined && next[index] > previous[index];
};

/** The version has to sit on the stable branch's line: its major for stable/N.x, major.minor for stable/N.M.x. */
const lineProblems = (baseRef, current, packageVersion) => {
  const flatLine = baseRef.match(/^stable\/(\d+)\.x$/);
  if (flatLine) {
    return current[0] === Number(flatLine[1]) ? [] : [`package.json ${packageVersion} is not on the ${baseRef} major (${flatLine[1]}).`];
  }
  const legacyLine = baseRef.match(/^stable\/(\d+)\.(\d+)\.x$/);
  if (!legacyLine) return [];
  const onLine = current[0] === Number(legacyLine[1]) && current[1] === Number(legacyLine[2]);
  return onLine ? [] : [`package.json ${packageVersion} is not on the ${baseRef} line.`];
};

/** A PR may leave the version alone or raise it, never lower it. */
const directionProblems = (basePackageVersion, packageVersion, current) => {
  const previous = parse(basePackageVersion);
  const unchanged = packageVersion === basePackageVersion;
  if (!previous || unchanged || isNewer(current, previous)) return [];
  return [`package.json goes backwards from ${basePackageVersion} to ${packageVersion}.`];
};

/** The release manifest has to keep describing the package version; a missing releaseId fails. */
const manifestProblems = (manifestReleaseId, packageVersion) => {
  if (manifestReleaseId === `v${packageVersion}`) return [];
  return [`deploy/production-release.json releaseId must be v${packageVersion}, got ${manifestReleaseId ?? 'nothing'}.`];
};

/**
 * @param {{ baseRef: string; basePackageVersion: string; packageVersion: string; manifestReleaseId: string | undefined }} input
 * @returns {{ ok: boolean; problems: string[] }}
 */
export const evaluateStableHotfixPolicy = ({ baseRef, basePackageVersion, packageVersion, manifestReleaseId }) => {
  const current = parse(packageVersion);
  if (!current) {
    return { ok: false, problems: [`Stable lines need a stable semver in package.json, got ${packageVersion}.`] };
  }
  const problems = [
    ...lineProblems(baseRef, current, packageVersion),
    ...directionProblems(basePackageVersion, packageVersion, current),
    ...manifestProblems(manifestReleaseId, packageVersion),
  ];
  return { ok: problems.length === 0, problems };
};
