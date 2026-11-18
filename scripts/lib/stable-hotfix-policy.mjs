/**
 * Policy for pull requests into a stable line. The release workflow infers the next version, moves the
 * changelog lane and updates the release manifest at release time, so a PR (a backport, a hotfix) does not
 * have to touch any of them. What stays enforced is only what would break production if it were wrong:
 * the version must stay a stable semver on the line's major (and never go backwards), and the release
 * manifest must still describe the package version.
 */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const parse = (version) => {
  const match = String(version).match(SEMVER);
  return match ? match.slice(1).map(Number) : null;
};

/** True when `next` is a newer version than `previous` (both parsed). */
const isNewer = (next, previous) => {
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== previous[index]) return next[index] > previous[index];
  }
  return false;
};

/**
 * @param {{ baseRef: string; basePackageVersion: string; packageVersion: string; manifestReleaseId?: string }} input
 * @returns {{ ok: boolean; problems: string[] }}
 */
export const evaluateStableHotfixPolicy = ({ baseRef, basePackageVersion, packageVersion, manifestReleaseId }) => {
  const problems = [];
  const current = parse(packageVersion);
  const previous = parse(basePackageVersion);

  if (!current) {
    problems.push(`Stable lines need a stable semver in package.json, got ${packageVersion}.`);
    return { ok: false, problems };
  }

  const flatLine = baseRef.match(/^stable\/(\d+)\.x$/);
  const legacyLine = baseRef.match(/^stable\/(\d+)\.(\d+)\.x$/);
  if (flatLine && current[0] !== Number(flatLine[1])) {
    problems.push(`package.json ${packageVersion} is not on the ${baseRef} major (${flatLine[1]}).`);
  }
  if (legacyLine && (current[0] !== Number(legacyLine[1]) || current[1] !== Number(legacyLine[2]))) {
    problems.push(`package.json ${packageVersion} is not on the ${baseRef} line.`);
  }

  if (previous && packageVersion !== basePackageVersion && !isNewer(current, previous)) {
    problems.push(`package.json goes backwards from ${basePackageVersion} to ${packageVersion}.`);
  }

  if (manifestReleaseId !== undefined && manifestReleaseId !== `v${packageVersion}`) {
    problems.push(`deploy/production-release.json releaseId must be v${packageVersion}, got ${manifestReleaseId}.`);
  }

  return { ok: problems.length === 0, problems };
};
