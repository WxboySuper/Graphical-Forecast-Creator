import { readFileSync } from 'node:fs';
import { MAX_REVIEW_THREADS, mergeOpenCodeFirstLookResults, parseOpenCodeFirstLookOutput, renderOpenCodeFirstLookComment } from './opencode-first-look-output.mjs';
import {
  applyPublicationGuards,
  FirstLookReviewUnavailableError,
  isFirstLookReviewUnavailableError,
  renderOpenCodeFirstLookUnavailableComment,
} from './opencode-first-look-context-guard.mjs';

const summaryMarker = '<!-- gfc-opencode-first-look-summary -->';
const MAX_UNAVAILABLE_REASON_LENGTH = 1_000;
const MAX_UNAVAILABLE_CI_URL_LENGTH = 2_000;

const sortUnresolvedFirst = (assessments) => [
  ...assessments.filter((assessment) => assessment.status !== 'addressed'),
  ...assessments.filter((assessment) => assessment.status === 'addressed'),
];

/** Limits stored assessments after every supplied thread has been parsed and guarded. */
const boundParsedThreadAssessments = (parsed) => {
  const assessments = parsed.reviewCommentAssessments ?? [];
  if (assessments.length <= MAX_REVIEW_THREADS) return parsed;
  return { ...parsed, reviewCommentAssessments: sortUnresolvedFirst(assessments).slice(0, MAX_REVIEW_THREADS) };
};

/** Limits rendered threads to those still assessed in the bounded result, reporting the full count. */
const boundedPublicationContext = (contextData, parsed) => {
  const threads = Array.isArray(contextData.openReviewThreads) ? contextData.openReviewThreads : [];
  const keptIds = new Set((parsed?.reviewCommentAssessments ?? []).map((assessment) => assessment.threadId));
  const kept = parsed?.reviewCommentAssessments ? threads.filter((thread) => keptIds.has(thread.id)) : threads;
  return {
    ...contextData,
    openReviewThreads: kept.slice(0, MAX_REVIEW_THREADS),
    openReviewThreadCount: Number.isInteger(contextData.openReviewThreadCount)
      ? contextData.openReviewThreadCount
      : threads.length,
    reviewThreadsTruncated: Boolean(contextData.reviewThreadsTruncated) || threads.length > MAX_REVIEW_THREADS,
  };
};

export function readFirstLookModelOutput(outputPath) {
  try {
    return readFileSync(outputPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new FirstLookReviewUnavailableError('OpenCode did not produce a review output file.');
    }
    throw new FirstLookReviewUnavailableError(`Could not read OpenCode review output: ${error.message}`);
  }
}

export function prepareFirstLookPublication(rawOutput, contextData) {
  let rawResult = null;
  try {
    rawResult = JSON.parse(rawOutput);
  } catch {
    throw new FirstLookReviewUnavailableError('First-look result must be JSON.');
  }
  // Parse and guard every supplied thread so an omitted thread can still raise a finding
  // or cap the score; only the stored/rendered sample is bounded afterwards.
  let parsed = parseOpenCodeFirstLookOutput(rawOutput, contextData);
  parsed = applyPublicationGuards(parsed, rawResult, contextData);
  if (contextData.priorStructuredReview) {
    parsed = mergeOpenCodeFirstLookResults(contextData.priorStructuredReview, parsed);
  }
  return boundParsedThreadAssessments(parsed);
}

/** Validate repair-pass JSON through the same guards used at publication time. */
export function validateFirstLookRepairOutput(rawOutput, contextData) {
  prepareFirstLookPublication(rawOutput, contextData);
}

export function buildFirstLookSummaryBody(parsed, contextData, { expectedSha, reviewKind, requestId }) {
  const review = renderOpenCodeFirstLookComment(parsed, boundedPublicationContext(contextData, parsed));
  const marker = reviewKind === 'manual'
    ? `<!-- gfc-opencode-first-look:manual:${expectedSha}:${requestId} -->`
    : `<!-- gfc-opencode-first-look:${reviewKind}:${expectedSha} -->`;
  const dataMarker = `<!-- gfc-opencode-first-look-data:${Buffer.from(JSON.stringify(parsed)).toString('base64')} -->`;
  return [review, dataMarker, summaryMarker, marker, `<!-- gfc-opencode-first-look-head:${expectedSha} -->`].join('\n\n');
}

export function buildFirstLookUnavailableBody(contextData, reason, { expectedSha, reviewKind, requestId }) {
  const safeContext = {
    ...contextData,
    ci: contextData.ci?.url
      ? { ...contextData.ci, url: contextData.ci.url.slice(0, MAX_UNAVAILABLE_CI_URL_LENGTH) }
      : contextData.ci,
  };
  const safeReason = String(reason ?? 'First-look review output could not be published.')
    .replace(/[\r\n]+/gu, ' ')
    .slice(0, MAX_UNAVAILABLE_REASON_LENGTH);
  const unavailable = renderOpenCodeFirstLookUnavailableComment(safeContext, safeReason);
  const marker = reviewKind === 'manual'
    ? `<!-- gfc-opencode-first-look:manual:${expectedSha}:${requestId} -->`
    : `<!-- gfc-opencode-first-look:${reviewKind}:${expectedSha} -->`;
  return [unavailable, summaryMarker, marker, `<!-- gfc-opencode-first-look-head:${expectedSha} -->`].join('\n\n');
}

export function findFirstLookSummaryComment(comments) {
  return comments.find((item) => item.user?.login === 'github-actions[bot]' && item.body?.includes(summaryMarker));
}

export function wrapFirstLookPublicationError(error) {
  if (isFirstLookReviewUnavailableError(error)) return error;
  return new FirstLookReviewUnavailableError(error?.message ?? 'First-look review output could not be published.');
}
