/**
 * Script test contract for stable-promotion.test.
 *
 * This file verifies the script or automation boundary represented by stable-promotion.test, including its inputs, outputs, and failure behavior.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStableVersion } from './package-version.mjs';

test('promotion target must be the stable form of main beta version', () => {
  assert.equal(deriveStableVersion('2.0.0-beta.4'), '2.0.0');
  assert.notEqual(deriveStableVersion('2.1.0-beta.1'), '2.0.0');
});