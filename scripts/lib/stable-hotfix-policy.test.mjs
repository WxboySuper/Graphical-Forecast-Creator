/**
 * Ensures flat stable hotfixes preserve the major and advance the minor with patch zero.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

test('flat stable hotfix versions keep the major and advance the minor', () => {
  const previous = '2.0.0'.match(/^(\d+)\.(\d+)\.(\d+)$/);
  const current = '2.1.0'.match(/^(\d+)\.(\d+)\.(\d+)$/);
  assert.equal(previous?.[1], current?.[1]);
  assert.ok(Number(current?.[2]) > Number(previous?.[2]));
  assert.equal(current?.[3], '0');
});
