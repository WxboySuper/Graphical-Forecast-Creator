const PORT_HEAD_PATTERN = /^port\/(\d+)-to-(.+)$/;

/**
 * @param {string} headRef
 * @returns {{ sourcePrNumber: number; targetSlug: string } | null}
 */
export const parsePortBranch = (headRef) => {
  const match = headRef.match(PORT_HEAD_PATTERN);
  if (!match) return null;
  return { sourcePrNumber: Number(match[1]), targetSlug: match[2] };
};

/**
 * Port branches eligible for automated cleanup after their PR closes.
 * Must stay aligned with port-changes.sh naming and cleanup-port-branches.yml guards.
 *
 * @param {string} headRef
 */
export const isDeletablePortBranch = (headRef) => parsePortBranch(headRef) !== null;

/**
 * Reverse port-changes.sh slugging: `feature/foo-bar` → `feature/foo/bar` only for known prefixes.
 *
 * @param {string} slug
 */
export const targetBranchFromSlug = (slug) => {
  if (slug === 'beta' || slug === 'main') return slug;
  for (const prefix of ['feature', 'hotfix', 'release']) {
    const marker = `${prefix}-`;
    if (slug.startsWith(marker)) {
      return `${prefix}/${slug.slice(marker.length)}`;
    }
  }
  return slug;
};

/**
 * Merges into main that post-merge-automation.yml already syncs onto beta.
 *
 * @param {string} sourceHeadRef
 */
export const postMergeOwnsMainToBetaSync = (sourceHeadRef) =>
  sourceHeadRef === 'beta' ||
  sourceHeadRef.startsWith('release/') ||
  sourceHeadRef.startsWith('feature/release-');

/**
 * @param {{
 *   targetBranch: string;
 *   baseRef: string;
 *   sourcePrBaseRef: string;
 *   sourcePrHeadRef: string;
 *   betaContainsMain?: boolean;
 * }} context
 */
export const isRedundantBetaPortPr = ({
  targetBranch,
  baseRef,
  sourcePrBaseRef,
  sourcePrHeadRef,
  betaContainsMain = true,
}) =>
  targetBranch === 'beta' &&
  baseRef === 'beta' &&
  sourcePrBaseRef === 'main' &&
  postMergeOwnsMainToBetaSync(sourcePrHeadRef) &&
  betaContainsMain;

/**
 * @param {{
 *   headRef: string;
 *   baseRef: string;
 *   targetBranch: string;
 *   sourcePrHeadRef: string;
 *   sourcePrBaseRef: string;
 *   sourcePrNumber: number;
 *   betaContainsMain?: boolean;
 * }} context
 */
export const evaluatePortPrPolicy = ({
  headRef,
  baseRef,
  targetBranch,
  sourcePrHeadRef,
  sourcePrBaseRef,
  sourcePrNumber,
  betaContainsMain = true,
}) => {
  if (!parsePortBranch(headRef)) {
    return { ok: true };
  }

  if (
    isRedundantBetaPortPr({
      targetBranch,
      baseRef,
      sourcePrBaseRef,
      sourcePrHeadRef,
      betaContainsMain,
    })
  ) {
    return {
      ok: false,
      message:
        `Port PR ${headRef} duplicates post-merge-automation: PR #${sourcePrNumber} ` +
        `(${sourcePrHeadRef} → main) already synced beta via CI. Close this port PR.`,
    };
  }

  return { ok: true };
};
