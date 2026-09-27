const MAX_OUTPUT_LENGTH = 12_000;
const MAX_BULLETS = 6;
const MAX_TEXT_LENGTH = 900;
const ASSESSMENTS = new Set(['addressed', 'still-open', 'unclear']);

const boundedText = (value, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT_LENGTH || /[\r\n]/.test(value)) {
    throw new Error(`First-look ${name} must be a non-empty string under ${MAX_TEXT_LENGTH} characters.`);
  }
  return value.trim();
};

const boundedList = (value, name, { allowEmpty = true } = {}) => {
  if (!Array.isArray(value) || value.length > MAX_BULLETS || (!allowEmpty && value.length === 0)) {
    throw new Error(`First-look ${name} must contain ${allowEmpty ? 'zero to' : 'one to'} ${MAX_BULLETS} items.`);
  }
  return value.map((item) => boundedText(item, name));
};

const boundedFindings = (value) => {
  if (!Array.isArray(value) || value.length > MAX_BULLETS) throw new Error(`First-look badThings must contain zero to ${MAX_BULLETS} findings.`);
  return value.map((finding) => {
    if (!finding || !['P0', 'P1', 'P2', 'P3'].includes(finding.priority)) throw new Error('First-look finding priority must be P0, P1, P2, or P3.');
    if (finding.line !== null && (!Number.isInteger(finding.line) || finding.line < 1)) throw new Error('First-look finding line must be a positive integer or null.');
    return {
      priority: finding.priority,
      title: boundedText(finding.title, 'finding title'),
      path: boundedText(finding.path, 'finding path'),
      line: finding.line,
      evidence: boundedText(finding.evidence, 'finding evidence'),
      impact: boundedText(finding.impact, 'finding impact'),
    };
  });
};

/** Parse the reviewer's bounded JSON response before any PR comment is published. */
export const parseOpenCodeFirstLookOutput = (raw, context) => {
  if (typeof raw !== 'string' || raw.length > MAX_OUTPUT_LENGTH) throw new Error('First-look result is empty or too large.');
  let result;
  try { result = JSON.parse(raw); } catch { throw new Error('First-look result must be JSON.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('First-look result must be a JSON object.');

  const summary = boundedList(result.summary, 'summary', { allowEmpty: false });
  const goodThings = boundedList(result.goodThings, 'goodThings');
  const badThings = boundedFindings(result.badThings);
  if (!Number.isInteger(result.rating) || result.rating < 0 || result.rating > 10) throw new Error('First-look rating must be an integer from 0 to 10.');

  const linkedIssues = Array.isArray(context.linkedIssues) ? context.linkedIssues : [];
  const linkedIssueAssessment = linkedIssues.length
    ? boundedText(result.linkedIssueAssessment, 'linkedIssueAssessment')
    : null;
  if (!linkedIssues.length && result.linkedIssueAssessment !== null) {
    throw new Error('First-look output must omit linked-issue analysis when the PR has no linked issue.');
  }

  const openThreads = Array.isArray(context.openReviewThreads) ? context.openReviewThreads : [];
  const assessments = result.reviewCommentAssessments;
  if (!Array.isArray(assessments) || assessments.length !== openThreads.length) {
    throw new Error('First-look output must assess each supplied open review thread exactly once.');
  }
  const expectedThreadIds = new Set(openThreads.map((thread) => thread.id));
  const seenThreadIds = new Set();
  const reviewCommentAssessments = assessments.map((assessment) => {
    if (!assessment || !expectedThreadIds.has(assessment.threadId) || seenThreadIds.has(assessment.threadId)) {
      throw new Error('First-look review-thread assessments do not match the supplied open threads.');
    }
    if (!ASSESSMENTS.has(assessment.status)) throw new Error('First-look review-thread status is invalid.');
    seenThreadIds.add(assessment.threadId);
    return {
      threadId: assessment.threadId,
      status: assessment.status,
      summary: boundedText(assessment.summary, 'review-comment summary'),
    };
  });

  return { summary, goodThings, badThings, rating: result.rating, linkedIssueAssessment, reviewCommentAssessments };
};

/** Render a compact, consistent PR comment. Conditional sections come from GitHub context. */
export const renderOpenCodeFirstLookComment = (result, context) => {
  const heading = context.hasPriorReviewComment ? 'Latest changes (follow-up)' : 'PR summary (first review)';
  const lines = [
    `## ${heading}`,
    ...result.summary.map((item) => `- ${item}`),
    '',
    '## Good things',
    ...(result.goodThings.length ? result.goodThings.map((item) => `- ${item}`) : ['- No specific strengths noted.']),
    '',
    '## Bad things',
    ...(result.badThings.length ? result.badThings.map((finding) => {
      const location = finding.line ? `${finding.path}:${finding.line}` : finding.path;
      return `- **[${finding.priority}] ${finding.title}** (${location}) Evidence: ${finding.evidence} Impact: ${finding.impact}`;
    }) : ['- No actionable findings.']),
    '',
    '## Rating',
    `${result.rating}/10`,
  ];

  if (context.linkedIssues?.length) {
    lines.push('', '## Connection to linked issue');
    for (const issue of context.linkedIssues) {
      const title = String(issue.title).replace(/[\r\n]/g, ' ').replace(/[\\`*_{}\[\]()<>#+.!|]/g, '\\$&');
      lines.push(`- [#${issue.number}: ${title}](${issue.url})`);
    }
    lines.push('', result.linkedIssueAssessment);
  }

  if (context.openReviewThreads?.length) {
    const resolvedCount = Number.isInteger(context.resolvedReviewThreadCount) ? context.resolvedReviewThreadCount : 0;
    const openCount = Number.isInteger(context.openReviewThreadCount) ? context.openReviewThreadCount : context.openReviewThreads.length;
    lines.push('', '## Review comment status', `- ${openCount} unresolved; ${resolvedCount} resolved in the supplied review history.`);
    for (const assessment of result.reviewCommentAssessments) {
      const thread = context.openReviewThreads.find((item) => item.id === assessment.threadId);
      const rawLocation = thread?.line ? `${thread.path}:${thread.line}` : thread?.path ?? 'review thread';
      const location = rawLocation.replace(/[\r\n`]/g, ' ');
      const status = assessment.status === 'addressed' ? 'Appears addressed by this revision'
        : assessment.status === 'still-open' ? 'Still open'
          : 'Unclear';
      lines.push(`- **${location}: ${status}.** ${assessment.summary}`);
    }
    if (context.reviewThreadsTruncated) lines.push('- Additional review threads were omitted from this bounded sample.');
    lines.push('', 'GitHub thread resolution remains a reviewer action.');
  }

  return lines.join('\n');
};
