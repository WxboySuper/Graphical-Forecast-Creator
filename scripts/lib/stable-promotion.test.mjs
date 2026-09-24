/**
 * Checks deriveStableVersion turns 2.0.0-beta.4 into 2.0.0 and does not collapse 2.1.0-beta.1 onto the 2.0.0 line.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStableVersion } from './package-version.mjs';

test('promotion target must be the stable form of main beta version', () => {
  assert.equal(deriveStableVersion('2.0.0-beta.4'), '2.0.0');
  assert.notEqual(deriveStableVersion('2.1.0-beta.1'), '2.0.0');
});
