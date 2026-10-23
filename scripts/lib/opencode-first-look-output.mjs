const MAX_OUTPUT_LENGTH = 40_000;
const MAX_BULLETS = 6;
const MAX_TEXT_LENGTH = 900;
const ASSESSMENTS = new Set(['addressed', 'still-open', 'unclear']);
const PRIOR_FINDING_ASSESSMENTS = new Set(['resolved', 'still-open', 'unclear']);

const boundedText = (value, name) => {
  assertTextType(value, name);
  assertTextPresent(value, name);
  assertTextLength(value, name);
  assertSingleLine(value, name);
  return value.trim();
};

const assertTextType = (value, name) => {
  if (typeof value !== 'string') throw invalidText(name);
};

const assertTextPresent = (value, name) => {
  if (!value.trim()) throw invalidText(name);
};

const assertTextLength = (value, name) => {
  if (value.length > MAX_TEXT_LENGTH) throw invalidText(name);
};

const assertSingleLine = (value, name) => {
  if (/[\r\n]/.test(value)) throw invalidText(name);
};

const invalidText = (name) => new Error(`First-look ${name} must be a non-empty string under ${MAX_TEXT_LENGTH} characters.`);

const boundedList = (value, name, { allowEmpty = true } = {}) => {
  assertListType(value, name);
  assertListLimit(value, name);
  assertListPresence(value, name, allowEmpty);
  return value.map((item) => boundedText(item, name));
};

const assertListType = (value, name) => {
  if (!Array.isArray(value)) throw invalidList(name);
};

const assertListLimit = (value, name) => {
  if (value.length > MAX_BULLETS) throw invalidList(name);
};

const assertListPresence = (value, name, allowEmpty) => {
  if (!allowEmpty && value.length === 0) throw invalidList(name, allowEmpty);
};

const invalidList = (name, allowEmpty = true) => new Error(
  `First-look ${name} must contain ${allowEmpty ? 'zero to' : 'one to'} ${MAX_BULLETS} items.`,
);

const boundedFindings = (value) => {
  if (!Array.isArray(value)) throw invalidFindings();
  if (value.length > MAX_BULLETS) throw invalidFindings();
  return value.map(parseFinding);
};

const invalidFindings = () => new Error(`First-look badThings must contain zero to ${MAX_BULLETS} findings.`);

const parseFinding = (finding) => {
  assertFindingObject(finding);
  assertFindingPriority(finding.priority);
  assertFindingLine(finding.line);
  return {
    priority: finding.priority,
    title: boundedText(finding.title, 'finding title'),
    path: boundedText(finding.path, 'finding path'),
    line: finding.line,
    evidence: boundedText(finding.evidence, 'finding evidence'),
    impact: boundedText(finding.impact, 'finding impact'),
  };
};

const assertFindingObject = (finding) => {
  if (!finding || typeof finding !== 'object') throw new Error('First-look finding must be an object.');
  if (Array.isArray(finding)) throw new Error('First-look finding must be an object.');
};

const assertFindingPriority = (priority) => {
  if (!['P0', 'P1', 'P2', 'P3'].includes(priority)) throw new Error('First-look finding priority must be P0, P1, P2, or P3.');
};

const assertFindingLine = (line) => {
  if (line === null) return;
  if (!Number.isInteger(line)) throw new Error('First-look finding line must be a positive integer or null.');
  if (line < 1) throw new Error('First-look finding line must be a positive integer or null.');
};

/** Union of every known changed path; tolerant of stale or partial sources. */
export const changedPathSet = (context) => new Set([
  ...(Array.isArray(context.changedFilePaths) ? context.changedFilePaths : []),
  ...((Array.isArray(context.files) ? context.files : []).map((file) => file.path)),
]);

/** Split findings into locatable ones and ones whose path/line drifted off the PR diff.
 * Drifted findings are reported (not thrown) so one bad location cannot kill
 * the whole review; the rating cap and coverage note keep it honest. */
const partitionFindingLocations = (findings, context) => {
  const paths = changedPathSet(context);
  const lineMap = context.changedLineNumbers ?? {};
  const valid = [];
  const dropped = [];
  for (const finding of findings) {
    if (!paths.has(finding.path)) {
      dropped.push({ ...finding, reason: 'path' });
      continue;
    }
    const rawLines = Object.prototype.hasOwnProperty.call(lineMap, finding.path) ? lineMap[finding.path] : undefined;
    const lines = Array.isArray(rawLines) ? rawLines : [];
    if (finding.line !== null && !lines.includes(finding.line)) {
      dropped.push({ ...finding, reason: 'line' });
      continue;
    }
    valid.push(finding);
  }
  return { valid, dropped };
};

/** True when the review has anything actionable: a locatable finding or a recorded drop. */
export const hasActionableFindings = (badThings = [], droppedFindings = []) => (
  (badThings ?? []).length > 0 || (droppedFindings ?? []).length > 0
);

const parseReviewAssessments = (assessments, openThreads) => {
  const expected = new Set(openThreads.map((thread) => thread.id));
  const accepted = new Map();
  const seen = new Set();
  for (const assessment of Array.isArray(assessments) ? assessments : []) {
    if (!isNewExpectedReviewAssessment(assessment, expected, seen)) continue;
    seen.add(assessment.threadId);
    accepted.set(assessment.threadId, parseReviewAssessment(assessment));
  }
  const missing = openThreads.find((thread) => !accepted.has(thread.id));
  if (missing) throw new Error('First-look output must assess every supplied open review thread before publishing.');
  return openThreads.map((thread) => accepted.get(thread.id));
};

const isNewExpectedReviewAssessment = (assessment, expected, seen) => {
  if (!assessment) return false;
  if (!expected.has(assessment.threadId)) return false;
  return !seen.has(assessment.threadId);
};

const parseReviewAssessment = (assessment) => ({
  threadId: assessment.threadId,
  status: assertAssessmentStatus(assessment.status),
  summary: boundedText(assessment.summary, 'review-comment summary'),
});

const assertAssessmentStatus = (status) => {
  if (!ASSESSMENTS.has(status)) throw new Error('First-look review-thread status is invalid.');
  return status;
};

const parsePriorFindingAssessments = (assessments, priorFindings) => {
  const expected = new Set(priorFindings.map((finding) => finding.findingId));
  const accepted = collectValidPriorFindingAssessments(assessments, expected);
  return priorFindings.map((finding) => assessmentOrUnclear(finding, accepted));
};

const collectValidPriorFindingAssessments = (assessments, expected) => {
  const accepted = new Map();
  if (!Array.isArray(assessments)) return accepted;
  for (const assessment of assessments) {
    if (!isNewKnownFindingAssessment(assessment, expected, accepted)) continue;
    const parsed = parsePriorFindingAssessment(assessment);
    if (parsed) accepted.set(parsed.findingId, parsed);
  }
  return accepted;
};

const isNewKnownFindingAssessment = (assessment, expected, accepted) => {
  if (!assessment) return false;
  if (!expected.has(assessment.findingId)) return false;
  return !accepted.has(assessment.findingId);
};

const parsePriorFindingAssessment = (assessment) => {
  if (!PRIOR_FINDING_ASSESSMENTS.has(assessment.status)) return null;
  try {
    return {
      findingId: assessment.findingId,
      status: assessment.status,
      summary: boundedText(assessment.summary, 'previous-finding summary'),
    };
  } catch {
    return null;
  }
};

const assessmentOrUnclear = (finding, accepted) => accepted.get(finding.findingId) ?? ({
  findingId: finding.findingId,
  status: 'unclear',
  summary: 'This run did not provide a valid assessment; the earlier finding remains for human follow-up.',
});

/** Parse the reviewer's bounded JSON response before any PR comment is published. */
export const parseOpenCodeFirstLookOutput = (raw, context) => {
  assertRawOutput(raw);
  const result = parseJson(raw);
  assertJsonObject(result);
  return parseReviewPayload(result, context);
};

const assertRawOutput = (raw) => {
  if (typeof raw !== 'string') throw new Error('First-look result is empty or too large.');
  if (raw.length > MAX_OUTPUT_LENGTH) throw new Error('First-look result is empty or too large.');
};

const parseJson = (raw) => {
  try { return JSON.parse(raw); } catch { throw new Error('First-look result must be JSON.'); }
};

const assertJsonObject = (result) => {
  if (!result || typeof result !== 'object') throw new Error('First-look result must be a JSON object.');
  if (Array.isArray(result)) throw new Error('First-look result must be a JSON object.');
};

const parseReviewPayload = (result, context = {}) => {
  const prSummary = boundedList(result.prSummary, 'prSummary', { allowEmpty: false });
  const latestChanges = boundedList(result.latestChanges, 'latestChanges');
  const goodThings = parseGoodThings(result);
  const { valid: badThings, dropped: droppedFindings } = parseFindings(result, context);
  const priorFindingAssessments = parsePriorFindingAssessments(result.priorFindingAssessments, context.priorFindings ?? []);
  const reviewCommentAssessments = parseContextReviewAssessments(result, context);
  const unresolvedThreadAssessments = reviewCommentAssessments.filter((assessment) => assessment.status !== 'addressed');
  if (unresolvedThreadAssessments.length && !hasActionableFindings(badThings, droppedFindings)) {
    throw new Error('First-look output must include concrete findings when a review thread remains open or unclear after investigation.');
  }
  const statusById = new Map(priorFindingAssessments.map((assessment) => [assessment.findingId, assessment.status]));
  const unresolvedPriorFindings = (context.priorFindings ?? []).filter((finding) => statusById.get(finding.findingId) !== 'resolved');
  const suppliedRating = parseRating(result.rating);
  const normalizedRating = normalizeRating(suppliedRating, [...badThings, ...unresolvedPriorFindings]);
  return {
    prSummary,
    latestChanges,
    goodThings,
    badThings,
    droppedFindings,
    // Preserve a low supplied score when findings were omitted: normalizeRating
    // returns 10 for an empty list, which must not raise a bad review.
    rating: capRatingForDrops(
      droppedFindings.length ? Math.min(suppliedRating, normalizedRating) : normalizedRating,
      droppedFindings,
      [...badThings, ...unresolvedPriorFindings],
    ),
    linkedIssueAssessment: parseLinkedIssueAssessment(result, context),
    reviewCommentAssessments,
    priorFindingAssessments,
  };
};

const parseGoodThings = (result) => boundedList(result.goodThings, 'goodThings');

const parseFindings = (result, context) => {
  const findings = boundedFindings(result.badThings);
  return partitionFindingLocations(findings, context);
};

/** Re-validate carry-forward findings: stored state is a hand-editable blob. */
const tryParseRetainedFinding = (finding) => {
  try {
    return parseFinding(finding);
  } catch {
    return null;
  }
};

/** Priorities that force the hard rating cap when a finding with them is omitted. */
const isHotPriority = (item) => item.priority === 'P0' || item.priority === 'P1';

/** A review with omitted findings is never perfect: P0/P1 drops cap hard,
 * P3-only drops cap light, anything else caps like a P2. */
const capRatingForDrops = (rating, droppedFindings, findings = []) => {
  if (!droppedFindings.length) return rating;
  if (droppedFindings.some(isHotPriority)) return Math.min(rating, 5);
  const allP3 = (items) => items.every((item) => item.priority === 'P3');
  // The light cap needs at least one locatable finding: drops-only output
  // must not reach the merge threshold on vacuous truth.
  if (findings.length > 0 && allP3(droppedFindings) && allP3(findings)) return Math.min(rating, 9);
  return Math.min(rating, 8);
};

const parseRating = (rating) => {
  if (!Number.isInteger(rating)) throw invalidRating();
  if (rating < 0) throw invalidRating();
  if (rating > 10) throw invalidRating();
  return rating;
};

const invalidRating = () => new Error('First-look rating must be an integer from 0 to 10.');

const normalizeRating = (rating, findings) => {
  if (findings.length === 0) return 10;
  if (findings.every((finding) => finding.priority === 'P3')) return 9;
  return Math.min(rating, 8);
};

const parseLinkedIssueAssessment = (result, context) => {
  const linkedIssues = Array.isArray(context.linkedIssues) ? context.linkedIssues : [];
  if (linkedIssues.length) return boundedText(result.linkedIssueAssessment, 'linkedIssueAssessment');
  assertNoLinkedIssueAssessment(result);
  return null;
};

const assertNoLinkedIssueAssessment = (result) => {
  if (result.linkedIssueAssessment !== null) {
    throw new Error('First-look output must omit linked-issue analysis when the PR has no linked issue.');
  }
};

const parseContextReviewAssessments = (result, context) => {
  const openThreads = Array.isArray(context.openReviewThreads) ? context.openReviewThreads : [];
  return parseReviewAssessments(result.reviewCommentAssessments, openThreads);
};

/** Render a compact, consistent PR comment. Conditional sections come from GitHub context. */
export const renderOpenCodeFirstLookComment = (result, context) => {
  return [
    ...renderSummarySections(result, context),
    ...renderReviewSections(result, context),
  ].join('\n');
};

const renderSummarySections = (result, context) => [
  ...renderPrSummary(result),
  ...renderLatestChanges(result, context),
  ...renderReviewAssessment(result),
];

const renderPrSummary = (result) => ['## PR Summary', ...result.prSummary.map((item) => `- ${item}`)];

const renderLatestChanges = (result, context) => {
  if (!context.hasPriorReviewComment) return [];
  if (context.latestChangesMode === 'same') return ['', '## Changes since previous review', 'No new commits since the previous review.'];
  if (context.latestChangesMode === 'comparison-failed') {
    return ['', '## Changes since previous review', 'GitHub could not provide the comparison with the previous reviewed commit.'];
  }
  if (context.latestChangesMode === 'unavailable') {
    return ['', '## Changes since previous review', 'The previous review did not record a commit, so GitHub could not identify changes since it.'];
  }
  const changes = result.latestChanges.length
    ? result.latestChanges.map((item) => `- ${item}`)
    : ['No specific later commit changes were summarized.'];
  return ['', '## Changes since previous review', ...changes];
};

const renderReviewAssessment = (result) => [
  '',
  '## Good things',
  ...(result.goodThings.length ? result.goodThings.map((item) => `- ${item}`) : ['- No specific strengths noted.']),
  '',
  '## Bad things',
  ...renderFindings(result.badThings),
  '',
  '## Rating',
  `${result.rating}/10`,
];

const renderReviewSections = (result, context) => [
  ...renderCoverageSection(result, context),
  ...renderLinkedIssueSection(result, context),
  ...renderReviewThreadSection(result, context),
  ...renderPriorFindingSection(result, context),
];

const renderCoverageSection = (result, context) => {
  const truncation = Array.isArray(context.diffTruncationReasons) ? context.diffTruncationReasons : [];
  const dropped = Array.isArray(result?.droppedFindings) ? result.droppedFindings : [];
  const omitted = Number.isInteger(result?.droppedOmittedCount) && result.droppedOmittedCount > 0
    ? [`...and ${result.droppedOmittedCount} more omitted finding(s) not shown.`]
    : [];
  const lines = [...truncation, ...renderDroppedFindingNotes(dropped), ...omitted];
  return lines.length ? ['', '## Review coverage', ...lines.map((line) => `- ${line}`)] : [];
};

/** Escape model-controlled text before it reaches markdown output. */
const escapeCoverageText = (value) => String(value ?? '')
  .replace(/[\r\n]+/gu, ' ')
  .replace(/[\\`*_{}\x5b\x5d()<>#+.!|'"~-]/gu, '\\$&');

/** One coverage line per omitted finding; titles/paths are already single-line and bounded. */
const renderDroppedFindingNotes = (droppedFindings) => droppedFindings.map((dropped) => {
  const location = Number.isInteger(dropped.line)
    ? escapeCoverageText(dropped.path) + ':' + dropped.line
    : escapeCoverageText(dropped.path);
  const reason = dropped.reason === 'line' || dropped.reason === 'path' ? dropped.reason : 'unknown';
  return 'Omitted finding [' + escapeCoverageText(dropped.priority) + '] "' + escapeCoverageText(dropped.title)
    + '" (' + location + ', ' + reason + '-drift): reported location was not in the PR diff.';
});

const renderLinkedIssueSection = (result, context) => context.linkedIssues?.length
  ? renderLinkedIssues(result, context.linkedIssues)
  : [];

const renderReviewThreadSection = (result, context) => {
  if (context.openReviewThreads?.length) return renderReviewThreads(result, context);
  return context.resolvedReviewThreadCount > 0
    ? ['', '## Review comment status', `- 0 unresolved; ${context.resolvedReviewThreadCount} resolved in the supplied review history.`]
    : [];
};

const renderPriorFindingSection = (result, context) => context.priorFindings?.length
  ? renderPriorFindings(result, context.priorFindings)
  : [];

/** Severity order for display: critical drops must survive the display cap. */
const severityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** Carry prior findings forward only when the reviewer says they remain open or unclear. */
export const mergeOpenCodeFirstLookResults = (previous, current) => {
  const priorAssessments = Array.isArray(current.priorFindingAssessments) ? current.priorFindingAssessments : [];
  const statusById = new Map(priorAssessments.map((assessment) => [assessment.findingId, assessment.status]));
  const retainedPrevious = (Array.isArray(previous.badThings) ? previous.badThings : [])
    .filter((finding) => {
      let id;
      try {
        id = getFirstLookFindingId(finding);
      } catch {
        return false;
      }
      return statusById.get(id) !== 'resolved';
    })
    .map(tryParseRetainedFinding)
    .filter(Boolean);
  const currentBadThings = Array.isArray(current.badThings) ? current.badThings : [];
  const findings = uniqueBy([...currentBadThings, ...retainedPrevious], findingKey).slice(0, MAX_BULLETS);
  const priorDrops = Array.isArray(previous.droppedFindings) ? previous.droppedFindings : [];
  const currentDrops = Array.isArray(current.droppedFindings) ? current.droppedFindings : [];
  const allDropped = uniqueBy(
    [...priorDrops, ...currentDrops],
    (dropped) => [dropped.priority, dropped.title, dropped.path, dropped.line, dropped.reason].join(':'),
  ).sort((a, b) => (severityRank[a.priority] ?? 4) - (severityRank[b.priority] ?? 4));
  // Cap on the full union before slicing: a critical drop past the display
  // cap must still sink the score.
  const supplied = Number.isInteger(current?.rating) ? current.rating : 10;
  const rating = capRatingForDrops(Math.min(supplied, normalizeRating(supplied, findings)), allDropped, findings);
  const droppedFindings = allDropped.slice(0, MAX_BULLETS);
  const prevGood = Array.isArray(previous.goodThings) ? previous.goodThings : [];
  const currGood = Array.isArray(current.goodThings) ? current.goodThings : [];
  return {
    ...current,
    goodThings: uniqueStrings([...prevGood, ...currGood]).slice(0, MAX_BULLETS),
    badThings: findings,
    droppedFindings,
    droppedOmittedCount: Math.max(allDropped.length - droppedFindings.length, 0),
    rating,
  };
};

const findingKey = (finding) => `${finding.priority}:${finding.path}:${finding.line ?? ''}:${finding.title.toLowerCase()}`;
export const getFirstLookFindingId = (finding) => findingKey(finding);
const uniqueBy = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];
const uniqueStrings = (items) => [...new Set(items)];

const renderFindings = (findings) => findings.length ? findings.map((finding) => {
  const location = finding.path
    ? (finding.line ? `${finding.path}:${finding.line}` : finding.path)
    : 'review thread';
  return `- **[${finding.priority}] ${finding.title}** (${location}) Evidence: ${finding.evidence} Impact: ${finding.impact}`;
}) : ['- No actionable findings.'];

const renderLinkedIssues = (result, issues) => [
  '',
  '## Connection to linked issue',
  ...issues.map((issue) => {
    const title = String(issue.title).replace(/[\r\n]/g, ' ').replace(/[\\`*_{}\x5b\x5d()<>#+.!|]/g, '\\$&');
    return `- [#${issue.number}: ${title}](${issue.url})`;
  }),
  '',
  result.linkedIssueAssessment,
];

const renderReviewThreads = (result, context) => {
  const resolved = Number.isInteger(context.resolvedReviewThreadCount) ? context.resolvedReviewThreadCount : 0;
  const open = Number.isInteger(context.openReviewThreadCount) ? context.openReviewThreadCount : context.openReviewThreads.length;
  const assessments = result.reviewCommentAssessments.map((assessment) => {
    const thread = context.openReviewThreads.find((item) => item.id === assessment.threadId);
    const location = (thread?.line ? `${thread.path}:${thread.line}` : thread?.path ?? 'review thread').replace(/[\r\n`]/g, ' ');
    const status = { addressed: 'Appears addressed by this revision', 'still-open': 'Still open', unclear: 'Unclear' }[assessment.status];
    return `- **${location}: ${status}.** ${assessment.summary}`;
  });
  return [
    '',
    '## Review comment status',
    `- ${open} unresolved; ${resolved} resolved in the supplied review history.`,
    ...assessments,
    ...(context.reviewThreadsTruncated ? ['- Additional review threads were omitted from this bounded sample.'] : []),
    '',
    'GitHub thread resolution remains a reviewer action.',
  ];
};

const renderPriorFindings = (result, priorFindings) => {
  const assessments = new Map(result.priorFindingAssessments.map((assessment) => [assessment.findingId, assessment]));
  return [
    '',
    '## Previous review findings',
    ...priorFindings.map((finding) => {
      const assessment = assessments.get(finding.findingId);
      const status = { resolved: 'Resolved', 'still-open': 'Still open', unclear: 'Unclear' }[assessment.status];
      return `- **[${status}] ${finding.title}** (${finding.path}${finding.line ? `:${finding.line}` : ''}). ${assessment.summary}`;
    }),
  ];
};
