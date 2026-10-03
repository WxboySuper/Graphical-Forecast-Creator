/** Guards against publishing first-look reviews when the model never read the PR diff/context. */

import { FirstLookReviewUnavailableError } from './opencode-first-look-review-unavailable.mjs';
import { assertContextReadFlag, parseFilesReviewed } from './opencode-first-look-files-reviewed.mjs';

export {
  FirstLookReviewUnavailableError,
  isFirstLookReviewUnavailableError,
  renderOpenCodeFirstLookUnavailableComment,
} from './opencode-first-look-review-unavailable.mjs';

const CONTEXT_ACCESS_BACKSTOP_PATTERNS = [
  /blocked by tool permissions/i,
  /could not (?:open|read).*context/i,
  /no access to the patch/i,
  /PR diff unavailable/i,
  /Full diff was inaccessible/i,
  /diff inaccessible/i,
];

const stringSummaryChunks = (values) => (values ?? []).filter((value) => typeof value === 'string');

const assessmentSummaries = (items) => stringSummaryChunks((items ?? []).map((item) => item?.summary));

const collectSummaryAssessmentText = (rawResult, parsed) => {
  const linked = rawResult?.linkedIssueAssessment ?? parsed?.linkedIssueAssessment;
  return [
    ...stringSummaryChunks(rawResult?.prSummary ?? parsed?.prSummary),
    ...stringSummaryChunks(rawResult?.latestChanges ?? parsed?.latestChanges),
    ...stringSummaryChunks(rawResult?.goodThings ?? parsed?.goodThings),
    ...assessmentSummaries(rawResult?.reviewCommentAssessments),
    ...assessmentSummaries(rawResult?.priorFindingAssessments),
    ...(typeof linked === 'string' ? [linked] : []),
  ];
};

const assertPhraseBackstop = (rawResult, parsed) => {
  const haystack = collectSummaryAssessmentText(rawResult, parsed).join('\n');
  for (const pattern of CONTEXT_ACCESS_BACKSTOP_PATTERNS) {
    if (pattern.test(haystack)) {
      throw new FirstLookReviewUnavailableError(
        'First-look review text admits the PR diff/context was not read; refusing to publish a score.',
      );
    }
  }
};

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
