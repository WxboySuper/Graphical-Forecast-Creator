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

function stringSummaryChunks(values) {
  return (values ?? []).filter((value) => typeof value === 'string');
}

function assessmentSummaries(items) {
  return stringSummaryChunks((items ?? []).map((item) => item?.summary));
}

/** Collect summary and assessment text for the phrase backstop (never finding evidence). */
// @codescene(disable:"Complex Method", disable:"Complex Conditional", disable:"Overall Code Complexity")
function collectSummaryAssessmentText(rawResult, parsed) {
  const linked = rawResult?.linkedIssueAssessment ?? parsed?.linkedIssueAssessment;
  return [
    ...stringSummaryChunks(rawResult?.prSummary ?? parsed?.prSummary),
    ...stringSummaryChunks(rawResult?.latestChanges ?? parsed?.latestChanges),
    ...stringSummaryChunks(rawResult?.goodThings ?? parsed?.goodThings),
    ...assessmentSummaries(rawResult?.reviewCommentAssessments),
    ...assessmentSummaries(rawResult?.priorFindingAssessments),
    ...(typeof linked === 'string' ? [linked] : []),
  ];
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

function changedFilePathSet(context) {
  const paths = context.changedFilePaths ?? context.files?.map((file) => file.path) ?? [];
  return new Set(paths);
}

function requireNonEmptyReviewedPath(path) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new FirstLookReviewUnavailableError('filesReviewed must contain non-empty changed-file paths.');
  }
  return path.trim();
}

function parseFilesReviewed(filesReviewed, context) {
  if (!Array.isArray(filesReviewed)) {
    throw new FirstLookReviewUnavailableError('First-look review must include a filesReviewed string array.');
  }
  const changed = changedFilePathSet(context);
  if (changed.size === 0) return [];
  const reviewed = filesReviewed.map((path) => {
    const normalized = requireNonEmptyReviewedPath(path);
    if (!changed.has(normalized)) {
      throw new FirstLookReviewUnavailableError('filesReviewed paths must be drawn from the PR changed-file list.');
    }
    return normalized;
  });
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
// @codescene(disable:"Complex Conditional")
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
