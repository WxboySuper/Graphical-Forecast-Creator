import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenCodeFirstLookOutput, renderOpenCodeFirstLookComment } from './opencode-first-look-output.mjs';

const context = {
  hasPriorReviewComment: false,
  linkedIssues: [],
  openReviewThreads: [],
  resolvedReviewThreadCount: 0,
};
const result = {
  summary: ['Adds stable comment updates for PR review runs.'],
  goodThings: ['The output stays concise.'],
  badThings: [],
  rating: 8,
  linkedIssueAssessment: null,
  reviewCommentAssessments: [],
};

test('renders the fixed first-review sections and hides absent conditional sections', () => {
  const parsed = parseOpenCodeFirstLookOutput(JSON.stringify(result), context);
  const rendered = renderOpenCodeFirstLookComment(parsed, context);
  assert.match(rendered, /^## PR summary \(first review\)/);
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
  assert.match(rendered, /^## Latest changes \(follow-up\)/);
  assert.match(rendered, /## Connection to linked issue/);
  assert.match(rendered, /## Review comment status\n- 1 unresolved; 2 resolved/);
  assert.match(rendered, /\[P2\] Retry can retain stale state/);
  assert.match(rendered, /Appears addressed by this revision/);
  assert.match(rendered, /GitHub thread resolution remains a reviewer action\./);
});

test('rejects missing required sections, invalid ratings, hallucinated linked issues, and mismatched threads', () => {
  assert.throws(() => parseOpenCodeFirstLookOutput('{"summary":[]}', context), /summary/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, rating: 11 }), context), /rating/);
  assert.throws(() => parseOpenCodeFirstLookOutput(JSON.stringify({ ...result, summary: ['two lines\nnot allowed'] }), context), /summary/);
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
