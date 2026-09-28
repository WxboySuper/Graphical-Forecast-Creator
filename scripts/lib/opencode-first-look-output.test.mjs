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
  rating: 8,
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
  assert.match(rendered, /## Rating\n8\/10/);
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

test('rejects missing required sections, invalid ratings, hallucinated linked issues, and mismatched threads', () => {
  assert.throws(() => parseOpenCodeFirstLookOutput('{"prSummary":[]}', context), /prSummary/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 11 }), context), /rating/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, prSummary: ['two lines\nnot allowed'] }), context), /prSummary/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, badThings: [{ priority: 'P4' }] }), context), /P0, P1, P2, or P3/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, linkedIssueAssessment: 'Issue 42' }), context), /omit linked-issue/);
  const withThread = { ...context, openReviewThreads: [{ id: 'thread-1', path: 'src/a.ts' }] };
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify(result), withThread), /assess each supplied open review thread/);
  const finding = { priority: 'P2', title: 'Issue', path: 'src/a.ts', line: 9, evidence: 'Evidence', impact: 'Impact' };
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, badThings: [finding] }), {
    ...context, changedFilePaths: ['src/b.ts'], changedLineNumbers: { 'src/b.ts': [9] },
  }), /path must be a changed PR file/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, badThings: [finding] }), {
    ...context, changedFilePaths: ['src/a.ts'], changedLineNumbers: { 'src/a.ts': [8] },
  }), /line must be an added line/);
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
  assert.deepEqual(merged.badThings.map(({ title }) => title), ['Unchecked response', 'Missing edge case']);
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
