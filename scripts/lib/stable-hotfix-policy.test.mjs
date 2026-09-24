/**
 * Checks that a stable hotfix keeps the major and minor version and advances only the patch, using 1.6.30 and 1.6.31 as the pair.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

test('stable hotfix versions keep the major and minor and advance the patch', () => {
  const previous = '1.6.30'.match(/^(\d+)\.(\d+)\.(\d+)$/);
  const current = '1.6.31'.match(/^(\d+)\.(\d+)\.(\d+)$/);
  assert.equal(previous?.[1], current?.[1]);
  assert.equal(previous?.[2], current?.[2]);
  assert.ok(Number(current?.[3]) > Number(previous?.[3]));
});
