import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFirstLookReviewUsedSuppliedContext, renderOpenCodeFirstLookUnavailableComment } from './opencode-first-look-context-guard.mjs';

const parsed = {
  prSummary: ['Summary'],
  latestChanges: [],
  goodThings: [],
  badThings: [],
  rating: 10,
  linkedIssueAssessment: null,
  reviewCommentAssessments: [],
  priorFindingAssessments: [],
};

test('rejects reviews that admit the PR diff/context was inaccessible', () => {
  const context = { files: [{ path: 'src/a.ts', patch: '+fix' }] };
  assert.throws(() => assertFirstLookReviewUsedSuppliedContext({
    ...parsed,
    prSummary: ['Full diff was inaccessible in this repair run so summary is from title only.'],
  }, context), /did not read the supplied PR context/);
});

test('renders an unavailable review comment without a score', () => {
  const rendered = renderOpenCodeFirstLookUnavailableComment(
    { ci: { url: 'https://example.com/ci', conclusion: 'success' } },
    'First-look review did not read the supplied PR context; refusing to publish a score.',
  );
  assert.match(rendered, /review unavailable/i);
  assert.doesNotMatch(rendered, /\/10/);
});
