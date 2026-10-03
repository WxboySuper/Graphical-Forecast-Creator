import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGhApiPaginatedResponse } from './gh-api-paginate.mjs';

test('flattens multi-page slurp output from gh api --paginate --slurp', () => {
  const pageOne = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
  const pageTwo = [{ id: 101 }, { id: 102 }];
  const flattened = parseGhApiPaginatedResponse(JSON.stringify([pageOne, pageTwo]));
  assert.equal(flattened.length, 102);
  assert.equal(flattened[0].id, 1);
  assert.equal(flattened.at(-1).id, 102);
});

test('accepts a single-page array response', () => {
  assert.deepEqual(parseGhApiPaginatedResponse('[{"id":7}]'), [{ id: 7 }]);
});

test('rejects concatenated page arrays without slurp', () => {
  assert.throws(
    () => parseGhApiPaginatedResponse('[{"id":1}][{"id":2}]'),
    /not valid JSON/,
  );
});
