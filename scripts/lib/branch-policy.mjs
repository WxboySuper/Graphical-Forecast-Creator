/** @typedef {{ ok: true, kind: string }} BranchPolicyOk */
/** @typedef {{ ok: false, message: string }} BranchPolicyFail */
/** @typedef {BranchPolicyOk | BranchPolicyFail} BranchPolicyResult */

const BACKPORT_BRANCH_PATTERN = /^backport\/\d+-to-\d+\.x$/;
const STABLE_BRANCH_PATTERN = /^stable\/\d+(?:\.\d+)?\.x$/;

/**
 * @param {string} headRef
 */
export const isHotfixBranch = (headRef) => headRef.startsWith('hotfix/');

/**
 * @param {string} headRef
 */
export const isBackportBranch = (headRef) => BACKPORT_BRANCH_PATTERN.test(headRef);

/**
 * @param {string} headRef
 * @returns {BranchPolicyResult}
 */
const evaluateMainTarget = (headRef) => {
  if (isHotfixBranch(headRef)) {
    return { ok: true, kind: 'hotfix' };
  }
  if (headRef.startsWith('release/')) {
    return { ok: true, kind: 'release' };
  }
  // main is the next-major integration line. Source branch naming is not a
  // merge gate; required checks and review determine whether a PR is ready.
  return { ok: true, kind: 'main-integration' };
};

/**
 * Branch routing for protected integration branches.
 *
 * @param {{ baseRef: string; headRef: string }} context
 * @returns {BranchPolicyResult}
 */
export const evaluateBranchPolicy = ({ baseRef, headRef }) => {
  if (baseRef === 'main') {
    return evaluateMainTarget(headRef);
  }
  if (STABLE_BRANCH_PATTERN.test(baseRef)) {
    if (isBackportBranch(headRef)) return { ok: true, kind: 'backport' };
    if (isHotfixBranch(headRef)) return { ok: true, kind: 'hotfix' };
    if (headRef.startsWith('release/')) return { ok: true, kind: 'release' };
    return { ok: true, kind: 'stable-maintenance' };
  }
  return { ok: true, kind: 'other' };
};
