/**
 * Script test contract for port-conflicts.test.
 *
 * This file verifies the script or automation boundary represented by port-conflicts.test, including its inputs, outputs, and failure behavior.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAutoResolveAllForwardPortConflicts,
  classifyForwardPortConflicts,
} from './port-conflicts.mjs';

describe('port conflicts', () => {
  it('keeps every forward-port conflict human-owned', () => {
    const result = classifyForwardPortConflicts([
      'server/package.json',
      'server/package-lock.json',
    ]);
    assert.deepEqual(result.autoResolvable, []);
    assert.deepEqual(result.needsHuman, ['server/package.json', 'server/package-lock.json']);
    assert.equal(canAutoResolveAllForwardPortConflicts(result.needsHuman), false);
  });
});