import { FirstLookReviewUnavailableError } from './opencode-first-look-review-unavailable.mjs';

const CONTEXT_ACCESS_BACKSTOP_PATTERNS = [
  /blocked by tool permissions/i,
  /could not (?:open|read).*context/i,
  /no access to the patch/i,
  /PR diff unavailable/i,
  /Full diff was inaccessible/i,
  /diff inaccessible/i,
];

const pushStringSummaries = (target, values) => {
  for (const value of values ?? []) {
    if (typeof value === 'string') target.push(value);
  }
};

const pushAssessmentSummaries = (target, items) => {
  for (const item of items ?? []) {
    if (typeof item?.summary === 'string') target.push(item.summary);
  }
};

// @codescene(disable:"Complex Method")
export function assertPhraseBackstop(rawResult, parsed) {
  const chunks = [];
  pushStringSummaries(chunks, rawResult?.prSummary ?? parsed?.prSummary);
  pushStringSummaries(chunks, rawResult?.latestChanges ?? parsed?.latestChanges);
  pushStringSummaries(chunks, rawResult?.goodThings ?? parsed?.goodThings);
  pushAssessmentSummaries(chunks, rawResult?.reviewCommentAssessments);
  pushAssessmentSummaries(chunks, rawResult?.priorFindingAssessments);
  const linked = rawResult?.linkedIssueAssessment ?? parsed?.linkedIssueAssessment;
  if (typeof linked === 'string') chunks.push(linked);
  const haystack = chunks.join('\n');
  for (const pattern of CONTEXT_ACCESS_BACKSTOP_PATTERNS) {
    if (pattern.test(haystack)) {
      throw new FirstLookReviewUnavailableError(
        'First-look review text admits the PR diff/context was not read; refusing to publish a score.',
      );
    }
  }
}
