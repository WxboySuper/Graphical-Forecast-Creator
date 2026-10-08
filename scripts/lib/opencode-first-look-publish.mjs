import { readFileSync } from 'node:fs';
import { mergeOpenCodeFirstLookResults, parseOpenCodeFirstLookOutput, renderOpenCodeFirstLookComment } from './opencode-first-look-output.mjs';
import {
  applyPublicationGuards,
  FirstLookReviewUnavailableError,
  isFirstLookReviewUnavailableError,
  renderOpenCodeFirstLookUnavailableComment,
} from './opencode-first-look-context-guard.mjs';

const summaryMarker = '<!-- gfc-opencode-first-look-summary -->';

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
  let parsed = parseOpenCodeFirstLookOutput(rawOutput, contextData);
  parsed = applyPublicationGuards(parsed, rawResult, contextData);
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
  const review = renderOpenCodeFirstLookComment(parsed, contextData);
  const marker = reviewKind === 'manual'
    ? `<!-- gfc-opencode-first-look:manual:${expectedSha}:${requestId} -->`
    : `<!-- gfc-opencode-first-look:${reviewKind}:${expectedSha} -->`;
  const dataMarker = `<!-- gfc-opencode-first-look-data:${Buffer.from(JSON.stringify(parsed)).toString('base64')} -->`;
  return [review, dataMarker, summaryMarker, marker, `<!-- gfc-opencode-first-look-head:${expectedSha} -->`].join('\n\n');
}

export function buildFirstLookUnavailableBody(contextData, reason, { expectedSha, reviewKind, requestId }) {
  const unavailable = renderOpenCodeFirstLookUnavailableComment(contextData, reason);
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
