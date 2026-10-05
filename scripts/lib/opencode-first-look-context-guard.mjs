/** Guards against publishing first-look reviews when the model never read the PR diff/context. */

import { FirstLookReviewUnavailableError } from './opencode-first-look-review-unavailable.mjs';
import { assertContextReadFlag, parseFilesReviewed } from './opencode-first-look-files-reviewed.mjs';
import { assertPhraseBackstop } from './opencode-first-look-phrase-backstop.mjs';

export {
  FirstLookReviewUnavailableError,
  isFirstLookReviewUnavailableError,
  renderOpenCodeFirstLookUnavailableComment,
} from './opencode-first-look-review-unavailable.mjs';

export const SAME_COMMIT_THREAD_DOWNGRADE_SUMMARY =
  'Thread was opened on the reviewed commit; mark addressed only after a later commit changes the cited code.';

// @codescene(disable:"Complex Conditional")
const downgradeSameCommitAssessment = (assessment, threads, head) => {
  if (assessment.status !== 'addressed') return assessment;
  const openedCommit = threads.get(assessment.threadId)?.openedAtCommitOid;
  if (!openedCommit || !head || openedCommit !== head) return assessment;
  return {
    ...assessment,
    status: 'unclear',
    summary: SAME_COMMIT_THREAD_DOWNGRADE_SUMMARY,
  };
};

export function applyThreadCommitPlausibility(assessments, context) {
  const threads = new Map((context.openReviewThreads ?? []).map((thread) => [thread.id, thread]));
  return assessments.map((assessment) => downgradeSameCommitAssessment(assessment, threads, context.head));
}

const changedPathSet = (context) =>
  new Set(context.changedFilePaths ?? context.files?.map((file) => file.path) ?? []);

const isSameCommitDowngrade = (before, after) =>
  before?.status === 'addressed'
  && after.status === 'unclear'
  && after.summary === SAME_COMMIT_THREAD_DOWNGRADE_SUMMARY;

/** P2 findings for threads the model marked addressed on the reviewed commit. */
function buildSameCommitDowngradeFindings(beforeAssessments, afterAssessments, context) {
  const threads = new Map((context.openReviewThreads ?? []).map((thread) => [thread.id, thread]));
  const changed = changedPathSet(context);
  const findings = [];
  for (const after of afterAssessments) {
    const before = beforeAssessments.find((item) => item.threadId === after.threadId);
    if (!isSameCommitDowngrade(before, after)) continue;
    const thread = threads.get(after.threadId);
    const path = thread?.path && changed.has(thread.path) ? thread.path : null;
    const line = path && thread?.line ? thread.line : null;
    findings.push({
      priority: 'P2',
      title: 'Open review thread on this commit not verified as addressed',
      path,
      line,
      evidence: after.summary,
      impact: 'Threads opened on the reviewed commit cannot be treated as addressed without a later code change.',
    });
  }
  return findings;
}

// @codescene(disable:"Complex Method")
export function applyPublicationGuards(parsed, rawResult, context) {
  assertContextReadFlag(rawResult);
  const filesReviewed = parseFilesReviewed(rawResult.filesReviewed, context);
  assertPhraseBackstop(rawResult, parsed);
  const beforeAssessments = parsed.reviewCommentAssessments;
  const reviewCommentAssessments = applyThreadCommitPlausibility(beforeAssessments, context);
  const downgradeFindings = buildSameCommitDowngradeFindings(beforeAssessments, reviewCommentAssessments, context);
  const badThings = [...parsed.badThings, ...downgradeFindings];
  const unresolved = reviewCommentAssessments.filter((assessment) => assessment.status !== 'addressed');
  if (unresolved.length && badThings.length === 0) {
    throw new FirstLookReviewUnavailableError(
      'First-look output must include concrete findings when a review thread remains open or unclear after investigation.',
    );
  }
  let rating = parsed.rating;
  if (downgradeFindings.length) rating = Math.min(rating, 8);
  return {
    ...parsed,
    contextRead: true,
    filesReviewed,
    badThings,
    rating,
    reviewCommentAssessments,
  };
}
