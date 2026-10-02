/** Guards against publishing first-look reviews when the model never read the PR diff/context. */

const CONTEXT_ACCESS_BACKSTOP_PATTERNS = [
  /blocked by tool permissions/i,
  /could not (?:open|read).*context/i,
  /no access to the patch/i,
  /PR diff unavailable/i,
  /Full diff was inaccessible/i,
  /diff inaccessible/i,
];

export class FirstLookReviewUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FirstLookReviewUnavailableError';
  }
}

export const isFirstLookReviewUnavailableError = (error) =>
  error instanceof FirstLookReviewUnavailableError || error?.name === 'FirstLookReviewUnavailableError';

/** Collect summary and assessment text for the phrase backstop (never finding evidence). */
function collectSummaryAssessmentText(rawResult, parsed) {
  const chunks = [
    ...(rawResult?.prSummary ?? parsed?.prSummary ?? []),
    ...(rawResult?.latestChanges ?? parsed?.latestChanges ?? []),
    ...(rawResult?.goodThings ?? parsed?.goodThings ?? []),
    ...(rawResult?.reviewCommentAssessments ?? []).map((item) => item?.summary),
    ...(rawResult?.priorFindingAssessments ?? []).map((item) => item?.summary),
    rawResult?.linkedIssueAssessment ?? parsed?.linkedIssueAssessment,
  ];
  return chunks.filter((value) => typeof value === 'string');
}

function assertPhraseBackstop(rawResult, parsed) {
  const haystack = collectSummaryAssessmentText(rawResult, parsed).join('\n');
  for (const pattern of CONTEXT_ACCESS_BACKSTOP_PATTERNS) {
    if (pattern.test(haystack)) {
      throw new FirstLookReviewUnavailableError(
        'First-look review text admits the PR diff/context was not read; refusing to publish a score.',
      );
    }
  }
}

function parseFilesReviewed(filesReviewed, context) {
  if (!Array.isArray(filesReviewed)) {
    throw new FirstLookReviewUnavailableError('First-look review must include a filesReviewed string array.');
  }
  const changed = new Set(context.changedFilePaths ?? context.files?.map((file) => file.path) ?? []);
  if (changed.size === 0) return [];
  const reviewed = [];
  for (const path of filesReviewed) {
    if (typeof path !== 'string' || !path.trim()) {
      throw new FirstLookReviewUnavailableError('filesReviewed must contain non-empty changed-file paths.');
    }
    const normalized = path.trim();
    if (!changed.has(normalized)) {
      throw new FirstLookReviewUnavailableError('filesReviewed paths must be drawn from the PR changed-file list.');
    }
    reviewed.push(normalized);
  }
  if (!reviewed.length) {
    throw new FirstLookReviewUnavailableError('filesReviewed must list at least one changed PR file that was reviewed.');
  }
  return [...new Set(reviewed)];
}

function assertContextReadFlag(rawResult) {
  if (rawResult.contextRead !== true) {
    throw new FirstLookReviewUnavailableError(
      'First-look review must set contextRead to true after reading the attached PR context and diff.',
    );
  }
}

/** Same-revision threads cannot be marked addressed without a later commit. */
export function applyThreadCommitPlausibility(assessments, context) {
  const threads = new Map((context.openReviewThreads ?? []).map((thread) => [thread.id, thread]));
  return assessments.map((assessment) => {
    if (assessment.status !== 'addressed') return assessment;
    const thread = threads.get(assessment.threadId);
    const openedCommit = thread?.openedAtCommitOid;
    if (openedCommit && context.head && openedCommit === context.head) {
      return {
        ...assessment,
        status: 'unclear',
        summary: 'Thread was opened on the reviewed commit; mark addressed only after a later commit changes the cited code.',
      };
    }
    return assessment;
  });
}

/** Validate structured context coverage and adjust thread assessments before publication. */
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

/** Render a replaceable comment when the reviewer could not use the supplied PR diff/context. */
export function renderOpenCodeFirstLookUnavailableComment(context, reason) {
  const ciLine = context.ci?.url
    ? `- Checks | CI: ${context.ci.url}${context.ci.conclusion ? ` (${context.ci.conclusion})` : ''}`
    : null;
  return [
    '## OpenCode first-look review unavailable',
    reason,
    '',
    'This revision was not scored because the reviewer could not produce a usable review from the PR diff/context.',
    ...(ciLine ? ['', '## CI status', ciLine] : []),
  ].join('\n');
}
