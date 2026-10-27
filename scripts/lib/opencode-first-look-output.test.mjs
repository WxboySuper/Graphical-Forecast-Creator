import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOpenCodeFirstLookResults, parseOpenCodeFirstLookOutput, renderOpenCodeFirstLookComment } from './opencode-first-look-output.mjs';

const context = {
  hasPriorReviewComment: false,
  latestChangesMode: 'same',
  priorFindings: [],
  linkedIssues: [],
  openReviewThreads: [],
  resolvedReviewThreadCount: 0,
};
const result = {
  prSummary: ['Adds stable comment updates for PR review runs.'],
  latestChanges: [],
  goodThings: ['The output stays concise.'],
  badThings: [],
  rating: 10,
  linkedIssueAssessment: null,
  reviewCommentAssessments: [],
  priorFindingAssessments: [],
};

test('renders the fixed first-review sections and hides absent conditional sections', () => {
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify(result), context);
  const rendered = renderOpenCodeFirstLookComment(parsed, context);
  assert.match(rendered, /^## PR Summary/);
  assert.match(rendered, /## Good things/);
  assert.match(rendered, /## Bad things\n- No actionable findings\./);
  assert.match(rendered, /## Rating\n10\/10/);
  assert.doesNotMatch(rendered, /Connection to linked issue|Review comment status/);
});

test('renders follow-up, linked-issue, and unresolved review-thread sections only when present', () => {
  const richContext = {
    hasPriorReviewComment: true,
    linkedIssues: [{ number: 42, title: 'Prevent stale restore', url: 'https://github.com/org/repo/issues/42' }],
    openReviewThreads: [{ id: 'thread-1', path: 'src/restore.ts', line: 18 }],
    changedFilePaths: ['src/restore.ts'],
    changedLineNumbers: { 'src/restore.ts': [18] },
    resolvedReviewThreadCount: 2,
  };
  const richResult = {
    ...result,
    badThings: [{
      priority: 'P2', title: 'Retry can retain stale state', path: 'src/restore.ts', line: 18,
      evidence: 'The fallback reads the previous snapshot.', impact: 'Users may restore outdated work.',
    }],
    linkedIssueAssessment: 'This change addresses the linked restore regression.',
    reviewCommentAssessments: [{ threadId: 'thread-1', status: 'addressed', summary: 'The stale state is now ignored.' }],
  };
  const rendered = renderOpenCodeFirstLookComment(parseOpenCodeFirstLookOutput(JSON.stringify(richResult), richContext), richContext);
  assert.match(rendered, /^## PR Summary/);
  assert.match(rendered, /## Changes since previous review/);
  assert.match(rendered, /## Connection to linked issue/);
  assert.match(rendered, /## Review comment status\n- 1 unresolved; 2 resolved/);
  assert.match(rendered, /\[P2\] Retry can retain stale state/);
  assert.match(rendered, /Appears addressed by this revision/);
  assert.match(rendered, /GitHub thread resolution remains a reviewer action\./);
});

test('rejects missing required sections, invalid ratings, and hallucinated linked issues', () => {
  assert.throws(() => parseOpenCodeFirstLookOutput('{"prSummary":[]}', context), /prSummary/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 11 }), context), /rating/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, prSummary: ['two lines\nnot allowed'] }), context), /prSummary/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, badThings: [{ priority: 'P4' }] }), context), /P0, P1, P2, or P3/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, linkedIssueAssessment: 'Issue 42' }), context), /omit linked-issue/);
  const finding = { priority: 'P2', title: 'Issue', path: 'src/a.ts', line: 9, evidence: 'Evidence', impact: 'Impact' };
  const badPath = parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, badThings: [finding] }), {
    ...context, changedFilePaths: ['src/b.ts'], changedLineNumbers: { 'src/b.ts': [9] },
  });
  assert.equal(badPath.badThings.length, 0);
  assert.deepEqual(badPath.droppedFindings, [{ ...finding, reason: 'path' }]);
  assert.equal(badPath.rating, 8);
  const badLineContext = {
    ...context, changedFilePaths: ['src/a.ts'], changedLineNumbers: { 'src/a.ts': [8] },
  };
  const badLine = parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, badThings: [finding] }), badLineContext);
  assert.equal(badLine.badThings.length, 0);
  assert.deepEqual(badLine.droppedFindings, [{ ...finding, reason: 'line' }]);
  assert.equal(badLine.rating, 8);
  const rendered = renderOpenCodeFirstLookComment(badLine, badLineContext);
  assert.match(rendered, /Omitted finding \[P2\] "Issue" \(src\/a\\\.ts:9, line-drift\): reported location was not in the PR diff\./);
});

test('open threads with only drifted findings still publish with a capped rating', () => {
  const withThread = { ...context, openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }] };
  const finding = { priority: 'P2', title: 'Issue', path: 'src/a.ts', line: 9, evidence: 'Evidence', impact: 'Impact' };
  const driftedContext = {
    ...withThread, changedFilePaths: ['src/a.ts'], changedLineNumbers: { 'src/a.ts': [8] },
  };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    badThings: [finding],
    reviewCommentAssessments: [{ threadId: 'thread-1', status: 'still-open', summary: 'The concern remains.' }],
  }), driftedContext);
  assert.equal(parsed.badThings.length, 0);
  assert.equal(parsed.droppedFindings.length, 1);
  assert.equal(parsed.rating, 8);
  const rendered = renderOpenCodeFirstLookComment(parsed, driftedContext);
  assert.match(rendered, /Omitted finding/);
  assert.match(rendered, /Still open/);
});

test('merged follow-ups retain omitted findings and keep the score capped', () => {
  const merged = mergeOpenCodeFirstLookResults(
    { ...result, badThings: [], droppedFindings: [{ priority: 'P2', title: 'Old drift', path: 'src/a.ts', line: 9, evidence: 'E', impact: 'I', reason: 'line' }] },
    { ...result, badThings: [], droppedFindings: [], rating: 10 },
  );
  assert.equal(merged.droppedFindings.length, 1);
  assert.equal(merged.rating, 8);
});

test('omitted critical findings cap harder, omitted polish caps lighter', () => {
  /** Builds a finding drifted off the diff for the given priority. */
  const drift = (priority) => ({
    priority, title: 'Drifted', path: 'src/a.ts', line: 99, evidence: 'Evidence', impact: 'Impact',
  });
  const driftedContext = {
    ...context, changedFilePaths: ['src/a.ts'], changedLineNumbers: { 'src/a.ts': [1] },
  };
  const critical = parseOpenCodeFirstLookOutput(
    JSON.stringify({ ...result, rating: 10, badThings: [drift('P0')] }), driftedContext,
  );
  assert.equal(critical.badThings.length, 0);
  assert.equal(critical.rating, 5);
  const polish = parseOpenCodeFirstLookOutput(
    JSON.stringify({ ...result, rating: 10, badThings: [drift('P3'), { ...drift('P3'), line: null }] }), driftedContext,
  );
  assert.equal(polish.badThings.length, 1);
  assert.equal(polish.rating, 9);
});

test('dropped polish with no locatable findings cannot reach the merge threshold', () => {
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 10, badThings: [{
    priority: 'P3', title: 'Nit', path: 'src/a.ts', line: 99, evidence: 'E', impact: 'I',
  }] }), {
    ...context, changedFilePaths: ['src/a.ts'], changedLineNumbers: { 'src/a.ts': [1] },
  });
  assert.equal(parsed.badThings.length, 0);
  assert.equal(parsed.rating, 8);
});

test('a critical drop past the display cap still sinks the merged score', () => {
  const retained = Array.from({ length: 6 }, (_, index) => ({
    priority: 'P2', title: `Old ${index}`, path: 'src/a.ts', line: index + 1, evidence: 'E', impact: 'I', reason: 'line',
  }));
  const merged = mergeOpenCodeFirstLookResults(
    { ...result, badThings: [], droppedFindings: retained },
    {
      ...result,
      badThings: [],
      droppedFindings: [{
        priority: 'P0', title: 'New critical', path: 'src/a.ts', line: 50, evidence: 'E', impact: 'I', reason: 'line',
      }],
      rating: 10,
    },
  );
  assert.equal(merged.droppedFindings.length, 6);
  assert.equal(merged.droppedOmittedCount, 1);
  assert.equal(merged.rating, 5);
  const rendered = renderOpenCodeFirstLookComment(merged, context);
  assert.match(rendered, /New critical/);
  assert.match(rendered, /1 more omitted finding/);
});

test('merged scores never rise above the supplied rating', () => {
  const merged = mergeOpenCodeFirstLookResults(
    { ...result, badThings: [] },
    { ...result, badThings: [], droppedFindings: [], rating: 2 },
  );
  assert.equal(merged.rating, 2);
});

test('tampered carry-forward entries are re-validated, not trusted', () => {
  const merged = mergeOpenCodeFirstLookResults(
    { ...result, badThings: [{ priority: 'P9', title: 42, path: null, line: 'x' }] },
    { ...result, badThings: [], droppedFindings: [], rating: 10 },
  );
  assert.deepEqual(merged.badThings, []);
  assert.equal(merged.rating, 10);
});

test('coverage notes show priority, line, and drift reason', () => {
  const drifted = {
    ...context, changedFilePaths: ['src/a.ts'], changedLineNumbers: { 'src/a.ts': [1] },
  };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, badThings: [
    { priority: 'P1', title: 'Bad line', path: 'src/a.ts', line: 9, evidence: 'E', impact: 'I' },
    { priority: 'P3', title: 'Bad file', path: 'src/zzz.ts', line: null, evidence: 'E', impact: 'I' },
  ] }), drifted);
  const rendered = renderOpenCodeFirstLookComment(parsed, drifted);
  assert.match(rendered, /\[P1\].*line-drift/);
  assert.match(rendered, /\[P3\].*path-drift/);
  assert.match(rendered, /\(src\/zzz\\\.ts, path-drift\)/);
});

test('omitted findings never raise a low supplied score', () => {
  const finding = { priority: 'P2', title: 'Issue', path: 'src/a.ts', line: 9, evidence: 'Evidence', impact: 'Impact' };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 2, badThings: [finding] }), {
    ...context, changedFilePaths: ['src/a.ts'], changedLineNumbers: { 'src/a.ts': [8] },
  });
  assert.equal(parsed.badThings.length, 0);
  assert.equal(parsed.droppedFindings.length, 1);
  assert.equal(parsed.rating, 2);
});

test('requires complete open-thread assessments before publishing', () => {
  const withThreads = {
    ...context,
    openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }, { id: 'thread-2', path: 'src/b.ts' }],
  };
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    reviewCommentAssessments: [
      { threadId: 'unknown-thread', status: 'addressed', summary: 'Untrusted extra thread.' },
      { threadId: 'thread-1', status: 'addressed', summary: 'The fix addresses this comment.' },
      { threadId: 'thread-1', status: 'still-open', summary: 'Duplicate assessment is ignored.' },
      { threadId: 'thread-2', status: 'invalid-status', summary: 'Invalid assessment is unclear.' },
    ],
  }), withThreads), /review-thread status is invalid/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, reviewCommentAssessments: [] }), withThreads), /assess every supplied open review thread/);
});

test('an open GitHub thread may still support 10/10 when investigation confirms the code resolves it', () => {
  const withThread = { ...context, openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }] };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    reviewCommentAssessments: [{ threadId: 'thread-1', status: 'addressed', summary: 'The current guard resolves the concern; the GitHub thread still needs manual resolution.' }],
  }), withThread);
  assert.equal(parsed.rating, 10);
});

test('a thread assessed still-open or unclear cannot be published as a clean perfect review', () => {
  const withThread = { ...context, openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }] };
  for (const status of ['still-open', 'unclear']) {
    assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({
      ...result,
      reviewCommentAssessments: [{ threadId: 'thread-1', status, summary: 'The review concern remains unresolved.' }],
    }), withThread), /concrete findings when a review thread remains open or unclear/);
  }
});

test('requires complete open-thread assessments before publishing', () => {
  const withThreads = {
    ...context,
    openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }, { id: 'thread-2', path: 'src/b.ts' }],
  };
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    reviewCommentAssessments: [
      { threadId: 'unknown-thread', status: 'addressed', summary: 'Untrusted extra thread.' },
      { threadId: 'thread-1', status: 'addressed', summary: 'The fix addresses this comment.' },
      { threadId: 'thread-1', status: 'still-open', summary: 'Duplicate assessment is ignored.' },
      { threadId: 'thread-2', status: 'invalid-status', summary: 'Invalid assessment is unclear.' },
    ],
  }), withThreads), /review-thread status is invalid/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, reviewCommentAssessments: [] }), withThreads), /assess every supplied open review thread/);
});

test('an open GitHub thread may still support 10/10 when investigation confirms the code resolves it', () => {
  const withThread = { ...context, openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }] };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    reviewCommentAssessments: [{ threadId: 'thread-1', status: 'addressed', summary: 'The current guard resolves the concern; the GitHub thread still needs manual resolution.' }],
  }), withThread);
  assert.equal(parsed.rating, 10);
});

test('a thread assessed still-open or unclear cannot be published as a clean perfect review', () => {
  const withThread = { ...context, openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }] };
  for (const status of ['still-open', 'unclear']) {
    assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({
      ...result,
      reviewCommentAssessments: [{ threadId: 'thread-1', status, summary: 'The review concern remains unresolved.' }],
    }), withThread), /concrete findings when a review thread remains open or unclear/);
  }
});

test('same-revision CI follow-ups retain earlier concrete findings in the shared comment', () => {
  const previous = {
    ...result,
    badThings: [{ priority: 'P1', title: 'Unchecked response', path: 'src/a.ts', line: 9, evidence: 'No validation', impact: 'Bad data is accepted.' }],
  };
  const current = {
    ...result,
    prSummary: ['The full PR description.'],
    priorFindingAssessments: [{ findingId: 'P1:src/a.ts:9:unchecked response', status: 'still-open', summary: 'Validation is still absent.' }],
    badThings: [{ priority: 'P2', title: 'Missing edge case', path: 'src/a.ts', line: 11, evidence: 'No boundary test', impact: 'Regression may go unnoticed.' }],
  };
  const merged = mergeOpenCodeFirstLookResults(previous, current);
  assert.deepEqual(merged.prSummary, current.prSummary);
  assert.deepEqual(merged.badThings.map(({ title }) => title), ['Missing edge case', 'Unchecked response']);
});

test('follow-up status marks prior findings resolved and does not carry them into current findings', () => {
  const priorFinding = {
    priority: 'P1', title: 'Unchecked response', path: 'src/a.ts', line: 9,
    evidence: 'No validation', impact: 'Bad data is accepted.',
    findingId: 'P1:src/a.ts:9:unchecked response',
  };
  const followupContext = {
    ...context,
    hasPriorReviewComment: true,
    priorFindings: [priorFinding],
    latestChangesMode: 'same',
    changedFilePaths: ['src/a.ts'],
    changedLineNumbers: { 'src/a.ts': [9] },
  };
  const followup = {
    ...result,
    priorFindingAssessments: [{ findingId: priorFinding.findingId, status: 'resolved', summary: 'The new guard rejects invalid data.' }],
  };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify(followup), followupContext);
  const previous = { ...result, badThings: [priorFinding] };
  const merged = mergeOpenCodeFirstLookResults(previous, parsed);
  const rendered = renderOpenCodeFirstLookComment(merged, followupContext);
  assert.deepEqual(merged.badThings, []);
  assert.match(rendered, /\[Resolved\] Unchecked response/);
  assert.match(rendered, /Changes since previous review\nNo new commits since the previous review\./);
});

test('normalizes ratings to findings: clean is 10, cosmetic-only is 9, and merge-blocking findings cap at 8', () => {
  const findingContext = { ...context, changedFilePaths: ['src/a.ts'] };
  const cosmetic = { priority: 'P3', title: 'Tidy naming', path: 'src/a.ts', line: null, evidence: 'The name is inconsistent.', impact: 'Cosmetic consistency only.' };
  const defect = { priority: 'P2', title: 'Missing boundary check', path: 'src/a.ts', line: null, evidence: 'The new path accepts an empty value.', impact: 'Invalid input reaches the API.' };

  assert.equal(parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 6 }), findingContext).rating, 10);
  assert.equal(parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 10, badThings: [cosmetic] }), findingContext).rating, 9);
  assert.equal(parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 9, badThings: [defect] }), findingContext).rating, 8);
  assert.equal(parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 7, badThings: [defect] }), findingContext).rating, 7);
  assert.equal(parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 6, badThings: [cosmetic, defect] }), findingContext).rating, 6);
});

test('unresolved prior findings prevent a perfect score until they are resolved', () => {
  const priorFinding = {
    priority: 'P2', title: 'Missing boundary check', path: 'src/a.ts', line: null,
    evidence: 'The prior review found the input check missing.', impact: 'Invalid input reaches the API.',
    findingId: 'P2:src/a.ts::missing boundary check',
  };
  const priorContext = { ...context, priorFindings: [priorFinding] };
  const unresolved = parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 10 }), priorContext);
  const resolved = parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    rating: 8,
    priorFindingAssessments: [{ findingId: priorFinding.findingId, status: 'resolved', summary: 'The new validation rejects empty input.' }],
  }), priorContext);

  assert.equal(unresolved.rating, 8);
  assert.equal(resolved.rating, 10);
});

test('merged follow-up findings keep the score consistent with unresolved findings', () => {
  const priorFinding = { priority: 'P3', title: 'Optional polish', path: 'src/a.ts', line: null, evidence: 'Name differs from convention.', impact: 'Cosmetic only.' };
  const current = { ...result, rating: 10, badThings: [] };
  const merged = mergeOpenCodeFirstLookResults({ ...result, badThings: [priorFinding] }, current);
  assert.deepEqual(merged.badThings, [priorFinding]);
  assert.equal(merged.rating, 9);
});

test('missing or malformed prior-finding assessments stay unclear and retain findings', () => {
  const priorFinding = {
    priority: 'P1', title: 'Unchecked response', path: 'src/a.ts', line: 9,
    evidence: 'No validation', impact: 'Bad data is accepted.',
    findingId: 'P1:src/a.ts:9:unchecked response',
  };
  const followupContext = {
    ...context,
    hasPriorReviewComment: true,
    priorFindings: [priorFinding],
    changedFilePaths: ['src/a.ts'],
    changedLineNumbers: { 'src/a.ts': [9] },
  };
  const followup = {
    ...result,
    priorFindingAssessments: [
      { findingId: 'unknown-id', status: 'resolved', summary: 'untrusted extra entry' },
      { findingId: priorFinding.findingId, status: 'resolved', summary: ' ' },
    ],
  };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify(followup), followupContext);
  const merged = mergeOpenCodeFirstLookResults({ ...result, badThings: [priorFinding] }, parsed);
  const rendered = renderOpenCodeFirstLookComment(merged, followupContext);

  assert.deepEqual(parsed.priorFindingAssessments, [{
    findingId: priorFinding.findingId,
    status: 'unclear',
    summary: 'This run did not provide a valid assessment; the earlier finding remains for human follow-up.',
  }]);
  assert.equal(merged.badThings.length, 1);
  assert.match(rendered, /\[Unclear\] Unchecked response/);
});

test('an unclear prior finding survives into the next saved review state', () => {
  const priorFinding = {
    priority: 'P1', title: 'Unchecked response', path: 'src/a.ts', line: 9,
    evidence: 'No validation', impact: 'Bad data is accepted.',
    findingId: 'P1:src/a.ts:9:unchecked response',
  };
  const firstFollowupContext = {
    ...context,
    hasPriorReviewComment: true,
    priorFindings: [priorFinding],
    changedFilePaths: ['src/a.ts'],
    changedLineNumbers: { 'src/a.ts': [9] },
  };
  const firstFollowup = parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    priorFindingAssessments: [],
  }), firstFollowupContext);
  const firstSavedState = mergeOpenCodeFirstLookResults(
    { ...result, badThings: [priorFinding] },
    firstFollowup,
  );

  const nextPriorFinding = {
    ...firstSavedState.badThings[0],
    findingId: 'P1:src/a.ts:9:unchecked response',
  };
  const secondFollowupContext = {
    ...firstFollowupContext,
    priorFindings: [nextPriorFinding],
  };
  const secondFollowup = parseOpenCodeFirstLookOutput(JSON.stringify({
    ...result,
    priorFindingAssessments: [],
  }), secondFollowupContext);
  const secondSavedState = mergeOpenCodeFirstLookResults(firstSavedState, secondFollowup);
  const rendered = renderOpenCodeFirstLookComment(secondSavedState, secondFollowupContext);

  assert.equal(secondSavedState.badThings.length, 1);
  assert.equal(secondSavedState.badThings[0].title, 'Unchecked response');
  assert.match(rendered, /\[Unclear\] Unchecked response/);
});

test('new findings take precedence over retained findings at the published finding limit', () => {
  const previousFindings = Array.from({ length: 6 }, (_, index) => ({
    priority: 'P2', title: `Earlier issue ${index}`, path: 'src/a.ts', line: index + 1,
    evidence: 'Earlier evidence', impact: 'Earlier impact.',
  }));
  const currentFinding = {
    priority: 'P1', title: 'New regression', path: 'src/a.ts', line: 20,
    evidence: 'New evidence', impact: 'New impact.',
  };
  const current = {
    ...result,
    badThings: [currentFinding],
    priorFindingAssessments: previousFindings.map((finding) => ({
      findingId: `${finding.priority}:${finding.path}:${finding.line}:${finding.title.toLowerCase()}`,
      status: 'still-open',
      summary: 'This earlier issue remains.',
    })),
  };
  const merged = mergeOpenCodeFirstLookResults({ ...result, badThings: previousFindings }, current);
  assert.equal(merged.badThings.length, 6);
  assert.equal(merged.badThings[0].title, 'New regression');
  assert.ok(!merged.badThings.some((finding) => finding.title === 'Earlier issue 5'));
});

test('distinguishes a failed commit comparison from an unrecorded prior head', () => {
  const priorContext = { ...context, hasPriorReviewComment: true, latestChangesMode: 'comparison-failed' };
  const rendered = renderOpenCodeFirstLookComment(parseOpenCodeFirstLookOutput(JSON.stringify(result), priorContext), priorContext);
  assert.match(rendered, /GitHub could not provide the comparison with the previous reviewed commit/);
  assert.doesNotMatch(rendered, /previous review did not record a commit/);
});

test('reports actual GitHub diff omissions as review coverage, not as a code finding', () => {
  const limitedContext = {
    ...context,
    diffTruncated: true,
    diffTruncationReasons: ['GitHub omitted a textual patch for one changed file.'],
  };
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify(result), limitedContext);
  const rendered = renderOpenCodeFirstLookComment(parsed, limitedContext);
  assert.match(rendered, /## Review coverage\n- GitHub omitted a textual patch for one changed file\./);
  assert.match(rendered, /## Bad things\n- No actionable findings\./);
  assert.equal(parsed.badThings.length, 0);
});


test('ignores malformed review summaries while requiring every open thread to have a valid assessment', () => {
  const withThread = {
    ...context,
    openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }],
  };

  for (const summary of ['', 42, 'two\nlines']) {
    assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({
      ...result,
      reviewCommentAssessments: [{ threadId: 'thread-1', status: 'addressed', summary }],
    }), withThread), /assess every supplied open review thread/);
  }
});
