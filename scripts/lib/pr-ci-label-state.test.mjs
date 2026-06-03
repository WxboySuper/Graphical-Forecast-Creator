import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ciLabelFromCheckRuns, diffCiLabels } from './pr-ci-label-state.mjs';

describe('ciLabelFromCheckRuns', () => {
  it('returns pending when there are no check runs', () => {
    assert.equal(ciLabelFromCheckRuns([]), 'ci:pending');
  });

  it('returns pending while any check is still running', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'in_progress', conclusion: null },
      ]),
      'ci:pending',
    );
  });

  it('returns failing when any completed check failed', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'failure' },
      ]),
      'ci:failing',
    );
  });

  it('returns passing only when every check completed successfully', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'skipped' },
      ]),
      'ci:passing',
    );
  });
<<<<<<< HEAD

  it('returns pending when a completed check has a null conclusion', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: null },
      ]),
      'ci:pending',
    );
  });
=======
>>>>>>> origin/pr/396
});

describe('diffCiLabels', () => {
  it('adds desired label and removes stale ci labels', () => {
    const result = diffCiLabels(['ci:failing', 'Bug'], 'ci:passing');
    assert.deepEqual(result.remove, ['ci:failing']);
    assert.deepEqual(result.add, ['ci:passing']);
  });

  it('makes no changes when desired label is already present', () => {
    const result = diffCiLabels(['ci:passing', 'Bug'], 'ci:passing');
    assert.deepEqual(result.remove, []);
    assert.deepEqual(result.add, []);
  });
});
