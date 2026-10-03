/** Guards against publishing first-look reviews when the model never read the PR diff/context. */

import { FirstLookReviewUnavailableError } from './opencode-first-look-review-unavailable.mjs';
import { assertContextReadFlag, parseFilesReviewed } from './opencode-first-look-files-reviewed.mjs';
import { assertPhraseBackstop } from './opencode-first-look-phrase-backstop.mjs';

export {
  FirstLookReviewUnavailableError,
  isFirstLookReviewUnavailableError,
  renderOpenCodeFirstLookUnavailableComment,
} from './opencode-first-look-review-unavailable.mjs';

export function applyThreadCommitPlausibility(assessments, context) {
  const threads = new Map((context.openReviewThreads ?? []).map((thread) => [thread.id, thread]));
  const head = context.head;
  return assessments.map((assessment) => {
    if (assessment.status !== 'addressed') return assessment;
    const openedCommit = threads.get(assessment.threadId)?.openedAtCommitOid;
    if (!openedCommit || !head || openedCommit !== head) return assessment;
    return {
      ...assessment,
      status: 'unclear',
      summary: 'Thread was opened on the reviewed commit; mark addressed only after a later commit changes the cited code.',
    };
  });
}

export function applyPublicationGuards(parsed, rawResult, context) {
  assertContextReadFlag(rawResult);
  const filesReviewed = parseFilesReviewed(rawResult.filesReviewed, context);
  assertPhraseBackstop(rawResult, parsed);
  const reviewCommentAssessments = applyThreadCommitPlausibility(parsed.reviewCommentAssessments, context);
  const unresolved = reviewCommentAssessments.filter((assessment) => assessment.status !== 'addressed');
  if (unresolved.length && parsed.badThings.length === 0) {
    throw new FirstLookReviewUnavailableError(
      'First-look output must include concrete findings when a review thread remains open or unclear after investigation.',
    );
  }
  return {
    ...parsed,
    contextRead: true,
    filesReviewed,
    reviewCommentAssessments,
  };
}
