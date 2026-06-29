'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isEmergencyDisabledCapability,
  isValidEmergencyDisableValue,
  parseEmergencyDisabledCapabilities,
} = require('./emergencyCapabilityOverrides');

const createLogSpy = () => {
  const entries = [];
  return {
    entries,
    log: {
      error(message) {
        entries.push({ level: 'error', message });
      },
      warn(message) {
        entries.push({ level: 'warn', message });
      },
      info(message) {
        entries.push({ level: 'info', message });
      },
    },
  };
};

describe('emergency capability overrides', () => {
  it('returns an empty disable set when the env var is unset', () => {
    const result = parseEmergencyDisabledCapabilities({});
    assert.deepEqual([...result.disabledKeys], []);
    assert.equal(result.malformed, false);
  });

  it('parses comma-separated known capability keys', () => {
    const result = parseEmergencyDisabledCapabilities({
      EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
    });
    assert.deepEqual([...result.disabledKeys], ['TSTM_GENERATION_ENABLED']);
  });

  it('ignores unknown keys and logs a warning', () => {
    const { log, entries } = createLogSpy();
    const result = parseEmergencyDisabledCapabilities(
      { EMERGENCY_DISABLED_CAPABILITIES: 'UNKNOWN,TSTM_GENERATION_ENABLED' },
      { log }
    );

    assert.deepEqual([...result.disabledKeys], ['TSTM_GENERATION_ENABLED']);
    assert.deepEqual(result.ignoredUnknownKeys, ['UNKNOWN']);
    assert.match(entries[0].message, /UNKNOWN/);
  });

  it('treats malformed sentinel values as zero emergency disables', () => {
    const { log, entries } = createLogSpy();
    const result = parseEmergencyDisabledCapabilities(
      { EMERGENCY_DISABLED_CAPABILITIES: 'true' },
      { log }
    );

    assert.deepEqual([...result.disabledKeys], []);
    assert.equal(result.malformed, true);
    assert.equal(entries[0].level, 'error');
  });

  it('treats control characters as malformed', () => {
    assert.equal(isValidEmergencyDisableValue('TSTM\nGENERATION_ENABLED'), false);
  });

  it('reports emergency disable membership for known keys only', () => {
    assert.equal(
      isEmergencyDisabledCapability('TSTM_GENERATION_ENABLED', {
        EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
      }),
      true
    );
    assert.equal(
      isEmergencyDisabledCapability('TSTM_GENERATION_ENABLED', {}),
      false
    );
  });
});
