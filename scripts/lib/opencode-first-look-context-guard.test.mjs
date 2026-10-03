import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPublicationGuards,
  applyThreadCommitPlausibility,
  FirstLookReviewUnavailableError,
  renderOpenCodeFirstLookUnavailableComment,
} from './opencode-first-look-output.mjs';
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
