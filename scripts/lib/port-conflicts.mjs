/** Paths where beta's version wins during a main→beta port. */
export const BETA_PORT_KEEP_TARGET_PATHS = [
  'package.json',
  'server/package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'CHANGELOG.md',
  'deploy/production-release.json',
];

/**
 * @param {string} path
 * @param {string[]} keepTargetPaths
 */
export const isBetaPortKeepTargetPath = (path, keepTargetPaths = BETA_PORT_KEEP_TARGET_PATHS) =>
  keepTargetPaths.includes(path);

/**
 * @param {string[]} conflictPaths
 * @param {string[]} [keepTargetPaths]
 * @returns {{ autoResolvable: string[]; needsHuman: string[] }}
 */
export const classifyBetaPortConflicts = (
  conflictPaths,
  keepTargetPaths = BETA_PORT_KEEP_TARGET_PATHS,
) => {
  const autoResolvable = [];
  const needsHuman = [];

  for (const path of conflictPaths) {
    if (isBetaPortKeepTargetPath(path, keepTargetPaths)) {
      autoResolvable.push(path);
    } else {
      needsHuman.push(path);
    }
  }

  return { autoResolvable, needsHuman };
};

/**
 * @param {string[]} conflictPaths
 * @param {string[]} [keepTargetPaths]
 * @returns {boolean}
 */
export const canAutoResolveAllBetaPortConflicts = (
  conflictPaths,
  keepTargetPaths = BETA_PORT_KEEP_TARGET_PATHS,
) => {
  const { needsHuman } = classifyBetaPortConflicts(conflictPaths, keepTargetPaths);
  return needsHuman.length === 0 && conflictPaths.length > 0;
};
