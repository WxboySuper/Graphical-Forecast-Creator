import { postMergeOwnsMainToBetaSync } from './port-pr-policy.mjs';

export const PORTING_MANUAL_LABEL = 'porting/manual';

/**
 * @param {string | undefined} json
 * @returns {Array<{ number: number; headRefName: string; title?: string; body?: string; url?: string }>}
 */
export const parseOpenBetaPrsJson = (json) => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * @param {string} baseBranch
 * @param {string} sourceBranch
 * @returns {string[]}
 */
export const resolvePortTargets = ({ baseBranch, sourceBranch }) => {
  if (baseBranch !== 'main') {
    return [];
  }

  if (postMergeOwnsMainToBetaSync(sourceBranch)) {
    return [];
  }

  return ['beta'];
};

/**
 * @param {string} text
 * @param {number} sourcePrNumber
 */
const referencesSourcePr = (text, sourcePrNumber) => {
  if (!text) return false;
  const patterns = [
    new RegExp(`\\bports?\\s+(?:PR\\s*)?#${sourcePrNumber}(?!\\d)`, 'i'),
    new RegExp(`\\bcherry.picks?\\s+#?${sourcePrNumber}(?!\\d)`, 'i'),
    new RegExp(`\\bport\\s+of\\s+#?${sourcePrNumber}(?!\\d)`, 'i'),
  ];
  return patterns.some((pattern) => pattern.test(text));
};

/**
 * @param {{
 *   headRefName: string;
 *   title?: string;
 *   body?: string;
 * }} pr
 * @param {number} sourcePrNumber
 * @param {string} sourceBranch
 */
export const isManualBetaPortPr = (pr, sourcePrNumber, sourceBranch) => {
  if (pr.headRefName.startsWith('port/')) {
    return false;
  }

  return (
    pr.headRefName === sourceBranch ||
    referencesSourcePr(pr.title ?? '', sourcePrNumber) ||
    referencesSourcePr(pr.body ?? '', sourcePrNumber)
  );
};

/**
 * @param {{
 *   labels?: string[];
 *   openBetaPrs?: Array<{ number: number; headRefName: string; title?: string; body?: string; url?: string }>;
 *   sourcePrNumber: number;
 *   sourceBranch: string;
 * }} context
 * @returns {{ skip: boolean; reason?: string; manualPr?: { number: number; url?: string; headRefName: string } }}
 */
export const shouldSkipPorting = ({
  labels = [],
  openBetaPrs = [],
  sourcePrNumber,
  sourceBranch,
}) => {
  if (labels.includes(PORTING_MANUAL_LABEL)) {
    return {
      skip: true,
      reason: `Source PR has \`${PORTING_MANUAL_LABEL}\` label; automated porting skipped.`,
    };
  }

  for (const pr of openBetaPrs) {
    if (isManualBetaPortPr(pr, sourcePrNumber, sourceBranch)) {
      return {
        skip: true,
        reason: `Open manual port PR #${pr.number} (${pr.headRefName} → beta) already exists.`,
        manualPr: pr,
      };
    }
  }

  return { skip: false };
};
