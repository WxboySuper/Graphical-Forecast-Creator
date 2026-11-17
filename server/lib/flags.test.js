/**
 * Baseline server checks derived from the shared flag registry: for every server-backed flag and
 * target, the public capability status follows the registry value, then the emergency and
 * deployment switches. Add a flag with a `capability` and it is covered here.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../flags.json');
const { CAPABILITY_REASON, getPublicCapabilityStatus, resolveCapabilityAvailability } = require('./capabilityStatus');
const { SERVER_FEATURES, resolveFlag } = require('./flags');

const FEATURES = Object.entries(SERVER_FEATURES);

describe('server flag registry', () => {
  it('reads the same values as the shared registry file', () => {
    for (const [name, entry] of Object.entries(registry.flags)) {
      for (const target of registry.targets) {
        assert.equal(resolveFlag(name, target), entry.values?.[target] ?? entry.default, `${name} on ${target}`);
      }
    }
    assert.equal(resolveFlag('notAFlag', 'production'), false);
  });

  for (const [name, feature] of FEATURES) {
    for (const target of registry.targets) {
      const key = feature.serverCapabilityKey;
      const exposed = resolveFlag(name, target) === true;

      it(`${name} on ${target}: ${exposed ? 'depends on deployment and emergency switches' : 'is registry-disabled'}`, () => {
        const env = { SERVER_TARGET: target };
        if (!exposed) {
          assert.equal(resolveCapabilityAvailability(key, { env: { ...env, [key]: 'true' } }).reason, CAPABILITY_REASON.REGISTRY_DISABLED);
          assert.equal(getPublicCapabilityStatus({ env }).capabilities[key], undefined);
          return;
        }
        assert.equal(resolveCapabilityAvailability(key, { env }).reason, CAPABILITY_REASON.DEPLOYMENT_DISABLED);
        assert.equal(resolveCapabilityAvailability(key, { env: { ...env, [key]: 'true' } }).reason, CAPABILITY_REASON.AVAILABLE);
        assert.equal(
          resolveCapabilityAvailability(key, { env: { ...env, [key]: 'true', EMERGENCY_DISABLED_CAPABILITIES: key } }).reason,
          CAPABILITY_REASON.EMERGENCY_DISABLED
        );
        assert.deepEqual(getPublicCapabilityStatus({ env: { ...env, [key]: 'true' } }).capabilities[key], {
          available: true,
          reason: CAPABILITY_REASON.AVAILABLE,
        });
      });
    }
  }

  it('answers unknown capability keys as unknown', () => {
    assert.equal(resolveCapabilityAvailability('NOT_A_CAPABILITY', { env: {} }).reason, CAPABILITY_REASON.UNKNOWN);
  });
});
