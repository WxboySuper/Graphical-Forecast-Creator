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

const boundedPublicationContext = (contextData) => {
  const threads = Array.isArray(contextData.openReviewThreads) ? contextData.openReviewThreads : [];
  return {
    ...contextData,
    openReviewThreads: threads.slice(0, MAX_REVIEW_THREADS),
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
  const publicationContext = boundedPublicationContext(contextData);
  let parsed = parseOpenCodeFirstLookOutput(rawOutput, publicationContext);
  parsed = applyPublicationGuards(parsed, rawResult, publicationContext);
  if (contextData.priorStructuredReview) {
    parsed = mergeOpenCodeFirstLookResults(contextData.priorStructuredReview, parsed);
  }
  return parsed;
}

/** Validate repair-pass JSON through the same guards used at publication time. */
export function validateFirstLookRepairOutput(rawOutput, contextData) {
  prepareFirstLookPublication(rawOutput, contextData);
}

export function buildFirstLookSummaryBody(parsed, contextData, { expectedSha, reviewKind, requestId }) {
  const review = renderOpenCodeFirstLookComment(parsed, boundedPublicationContext(contextData));
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
