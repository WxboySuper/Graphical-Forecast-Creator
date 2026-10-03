import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGhApiSlurpPaginateArgs, parseGhApiPaginatedResponse } from './gh-api-paginate.mjs';

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

test('buildGhApiSlurpPaginateArgs puts per_page in the endpoint without jq flags', () => {
  const args = buildGhApiSlurpPaginateArgs('repos/WxboySuper/Graphical-Forecast-Creator/issues/1540/comments');
  assert.deepEqual(args, [
    'api',
    'repos/WxboySuper/Graphical-Forecast-Creator/issues/1540/comments?per_page=100',
    '--paginate',
    '--slurp',
  ]);
  assert.equal(args.includes('-q'), false);
  assert.equal(args.includes('--jq'), false);
  assert.match(args[1], /per_page=100$/);
});
