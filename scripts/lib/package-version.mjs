/** @typedef {{ ok: true }} VersionPolicyOk */
/** @typedef {{ ok: false, message: string }} VersionPolicyFail */
/** @typedef {VersionPolicyOk | VersionPolicyFail} VersionPolicyResult */

const BETA_PRERELEASE_PATTERN = /-beta(\.|$)/i;
const STABLE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const RELEASE_BRANCH_PATTERN = /^release\/v[0-9]+\.[0-9]+\.[0-9]+$/;

/**
 * @param {string} version
 */
export const hasBetaPrerelease = (version) => BETA_PRERELEASE_PATTERN.test(version);

/**
 * @param {string} version
 * @returns {string | null}
 */
export const deriveStableVersion = (version) => {
  const stable = version.replace(/-beta(\.[0-9A-Za-z.-]*)?$/i, '');
  if (stable === version) {
    return STABLE_VERSION_PATTERN.test(stable) ? stable : null;
  }
  return STABLE_VERSION_PATTERN.test(stable) ? stable : null;
};

/**
 * @param {string} stableVersion
 */
export const releaseBranchForStable = (stableVersion) => `release/v${stableVersion}`;

/**
 * @param {string} headRef
 */
export const isReleasePromotionBranch = (headRef) => RELEASE_BRANCH_PATTERN.test(headRef);

/**
 * @param {{
 *   version: string;
 *   targetBranch: string;
 *   headRef?: string;
 *   eventName?: string;
 * }} context
 * @returns {VersionPolicyResult}
 */
export const evaluateVersionPolicy = ({ version, targetBranch, headRef = '', eventName = '' }) => {
  const hasBeta = hasBetaPrerelease(version);
  const isPullRequest = eventName === 'pull_request';

  if (targetBranch === 'beta' && !hasBeta) {
    return {
      ok: false,
      message:
        `package.json version "${version}" must include a -beta prerelease on branch "${targetBranch}" ` +
        '(for example 1.6.0-beta.1).',
    };
  }

  if (targetBranch === 'main') {
    const isBetaPromotionPr = isPullRequest && headRef === 'beta';

    if (hasBeta && !isBetaPromotionPr) {
      const promotionHint = isPullRequest
        ? 'Open a beta → main promotion PR (head branch beta) or hotfix/* with a stable version.'
        : 'main must only receive stable semver versions.';
      return {
        ok: false,
        message: `package.json version "${version}" must not include a -beta prerelease on "${targetBranch}". ${promotionHint}`,
      };
    }

    if (isBetaPromotionPr && !hasBeta) {
      return {
        ok: false,
        message:
          `Beta → main promotion PRs should carry a -beta prerelease on beta (got "${version}"). ` +
          'CI will strip to stable on merge automatically.',
      };
    }
  }

  return { ok: true };
};
