import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPublicationGuards,
  applyThreadCommitPlausibility,
  FirstLookReviewUnavailableError,
  renderOpenCodeFirstLookUnavailableComment,
} from './opencode-first-look-context-guard.mjs';
import { prepareFirstLookPublication, readFirstLookModelOutput, wrapFirstLookPublicationError } from './opencode-first-look-publish.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const baseParsed = {
  prSummary: ['Summary'],
  latestChanges: [],
  goodThings: [],
  badThings: [],
  rating: 10,
  linkedIssueAssessment: null,
  reviewCommentAssessments: [],
  priorFindingAssessments: [],
};

const context = {
  head: 'abc1234567890123456789012345678901234567890',
  changedFilePaths: ['scripts/a.mjs'],
  files: [{ path: 'scripts/a.mjs', patch: '+change' }],
  openReviewThreads: [],
};

const rawWithCoverage = {
  ...baseParsed,
  contextRead: true,
  filesReviewed: ['scripts/a.mjs'],
};

test('requires contextRead and overlapping filesReviewed', () => {
  assert.throws(
    () => applyPublicationGuards(baseParsed, { ...baseParsed, contextRead: false, filesReviewed: [] }, context),
    (error) => error instanceof FirstLookReviewUnavailableError,
  );
  assert.throws(
    () => applyPublicationGuards(baseParsed, { ...baseParsed, contextRead: true, filesReviewed: [] }, context),
    /filesReviewed must list at least one changed PR file/,
  );
  const parsed = applyPublicationGuards(baseParsed, rawWithCoverage, context);
  assert.equal(parsed.contextRead, true);
  assert.deepEqual(parsed.filesReviewed, ['scripts/a.mjs']);
});

test('phrase backstop ignores finding evidence but catches summary admissions', () => {
  const raw = {
    ...rawWithCoverage,
    badThings: [{
      priority: 'P2',
      title: 'Issue',
      path: 'scripts/a.mjs',
      line: null,
      evidence: 'could not open the attached context file in an older run',
      impact: 'Impact',
    }],
  };
  applyPublicationGuards({ ...baseParsed, badThings: raw.badThings }, raw, context);
  assert.throws(
    () => applyPublicationGuards(baseParsed, { ...rawWithCoverage, prSummary: ['could not open the attached context file'] }, context),
    /admits the PR diff\/context was not read/,
  );
});

test('downgrades addressed assessments for threads opened on the reviewed commit', () => {
  const assessments = [{ threadId: 'thread-1', status: 'addressed', summary: 'Looks fixed.' }];
  const threadContext = {
    head: 'abc1234567890123456789012345678901234567890',
    openReviewThreads: [{ id: 'thread-1', openedAtCommitOid: 'abc1234567890123456789012345678901234567890' }],
  };
  const adjusted = applyThreadCommitPlausibility(assessments, threadContext);
  assert.equal(adjusted[0].status, 'unclear');
});

test('same-commit thread downgrades publish P2 findings instead of unavailable', () => {
  const head = 'abc1234567890123456789012345678901234567890';
  const threadContext = {
    head,
    changedFilePaths: ['scripts/a.mjs'],
    files: [{ path: 'scripts/a.mjs', patch: '+x' }],
    openReviewThreads: [{
      id: 'thread-1',
      path: 'scripts/a.mjs',
      line: 12,
      openedAtCommitOid: head,
    }],
  };
  const parsed = applyPublicationGuards({
    ...baseParsed,
    rating: 10,
    reviewCommentAssessments: [{ threadId: 'thread-1', status: 'addressed', summary: 'Looks fixed.' }],
  }, rawWithCoverage, threadContext);
  assert.equal(parsed.rating, 8);
  assert.equal(parsed.badThings.length, 1);
  assert.equal(parsed.badThings[0].title, 'Open review thread on this commit not verified as addressed');
  assert.equal(parsed.badThings[0].path, 'scripts/a.mjs');
  assert.equal(parsed.badThings[0].line, 12);
});

test('same-commit downgrade uses null path when thread file is outside the PR diff', () => {
  const head = 'abc1234567890123456789012345678901234567890';
  const parsed = applyPublicationGuards({
    ...baseParsed,
    reviewCommentAssessments: [{ threadId: 'thread-1', status: 'addressed', summary: 'Looks fixed.' }],
  }, rawWithCoverage, {
    head,
    changedFilePaths: ['scripts/a.mjs'],
    files: [{ path: 'scripts/a.mjs' }],
    openReviewThreads: [{
      id: 'thread-1',
      path: 'README.md',
      line: 3,
      openedAtCommitOid: head,
    }],
  });
  assert.equal(parsed.badThings[0].path, null);
  assert.equal(parsed.badThings[0].line, null);
});

test('still-open threads without findings remain unavailable', () => {
  assert.throws(
    () => applyPublicationGuards({
      ...baseParsed,
      reviewCommentAssessments: [{ threadId: 'thread-1', status: 'still-open', summary: 'Still broken.' }],
    }, rawWithCoverage, context),
    (error) => error instanceof FirstLookReviewUnavailableError,
  );
});

test('readFirstLookModelOutput wraps missing output files', () => {
  assert.throws(() => readFirstLookModelOutput('/tmp/does-not-exist-opencode-review-output.md'), /did not produce a review output file/);
});

test('prepareFirstLookPublication validates JSON reviews end-to-end', () => {
  const dir = mkdtempSync(join(tmpdir(), 'first-look-'));
  try {
    const outputPath = join(dir, 'out.json');
    writeFileSync(outputPath, JSON.stringify(rawWithCoverage));
    const parsed = prepareFirstLookPublication(readFirstLookModelOutput(outputPath), {
      ...context,
      openReviewThreads: [],
    });
    assert.equal(parsed.rating, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wrapFirstLookPublicationError normalizes unexpected failures', () => {
  const wrapped = wrapFirstLookPublicationError(new Error('boom'));
  assert.ok(wrapped instanceof FirstLookReviewUnavailableError);
});

test('renders an unavailable review comment without a score', () => {
  const rendered = renderOpenCodeFirstLookUnavailableComment(
    { ci: { url: 'https://example.com/ci', conclusion: 'success' } },
    'OpenCode did not produce a review output file.',
  );
  assert.match(rendered, /review unavailable/i);
  assert.doesNotMatch(rendered, /\/10/);
});
