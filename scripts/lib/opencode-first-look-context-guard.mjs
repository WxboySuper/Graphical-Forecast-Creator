const REVIEW_WITHOUT_CONTEXT_PATTERNS = [
  /blocked by tool permissions/i,
  /opencode-pr-review-context\.json is blocked/i,
  /PR diff unavailable/i,
  /Full diff was inaccessible/i,
  /diff inaccessible/i,
  /context file.*blocked/i,
  /comment bodies and PR diff unavailable/i,
  /comment bodies and diff inaccessible/i,
];

/** Collect user-visible review strings for blocked-context detection. */
function collectReviewTextFields(result) {
  const chunks = [
    ...(result.prSummary ?? []),
    ...(result.latestChanges ?? []),
    ...(result.goodThings ?? []),
    ...(result.badThings ?? []).flatMap((finding) => [finding.title, finding.evidence, finding.impact]),
    ...(result.reviewCommentAssessments ?? []).map((assessment) => assessment.summary),
    ...(result.priorFindingAssessments ?? []).map((assessment) => assessment.summary),
    result.linkedIssueAssessment,
  ];
  return chunks.filter((value) => typeof value === 'string');
}

/** Reject model output that admits it never read the attached PR diff/context. */
export function assertFirstLookReviewUsedSuppliedContext(result, context) {
  if (!Array.isArray(context.files) || context.files.length === 0) return;
  const haystack = collectReviewTextFields(result).join('\n');
  for (const pattern of REVIEW_WITHOUT_CONTEXT_PATTERNS) {
    if (pattern.test(haystack)) {
      throw new Error('First-look review did not read the supplied PR context; refusing to publish a score.');
    }
  }
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
    'This revision was not scored because the reviewer could not read the supplied PR diff/context.',
    ...(ciLine ? ['', '## CI status', ciLine] : []),
  ].join('\n');
}
