import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGhApiArgs, buildGhApiSlurpPaginateArgs, parseGhApiPaginatedResponse } from './gh-api-paginate.mjs';

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

test('buildGhApiArgs keeps the endpoint as a single arg with GET default', () => {
  const args = buildGhApiArgs('repos/WxboySuper/Graphical-Forecast-Creator/pulls/1584');
  assert.deepEqual(args, [
    'api',
    '--method',
    'GET',
    'repos/WxboySuper/Graphical-Forecast-Creator/pulls/1584',
  ]);
});

test('buildGhApiArgs never puts the HTTP verb where gh expects the endpoint', () => {
  for (const method of ['GET', 'POST', 'PATCH']) {
    const args = buildGhApiArgs('repos/o/r/pulls/1', { body: 'hi' }, method);
    assert.equal(args[0], 'api');
    assert.equal(args[1], '--method');
    assert.equal(args[2], method);
    assert.equal(args[3], 'repos/o/r/pulls/1');
  }
});

test('buildGhApiArgs encodes POST comment create and PATCH comment update', () => {
  assert.deepEqual(
    buildGhApiArgs('repos/o/r/issues/1/comments', { body: 'posted' }, 'POST'),
    ['api', '--method', 'POST', 'repos/o/r/issues/1/comments', '-f', 'body=posted'],
  );
  assert.deepEqual(
    buildGhApiArgs('repos/o/r/issues/comments/2', { body: 'updated' }, 'PATCH'),
    ['api', '--method', 'PATCH', 'repos/o/r/issues/comments/2', '-f', 'body=updated'],
  );
});
