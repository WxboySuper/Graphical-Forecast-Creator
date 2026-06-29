'use strict';

const { KNOWN_SERVER_CAPABILITY_KEYS } = require('./serverFeatureExposure');

const EMERGENCY_DISABLED_ENV_KEY = 'EMERGENCY_DISABLED_CAPABILITIES';
const KNOWN_CAPABILITY_KEY_SET = new Set(KNOWN_SERVER_CAPABILITY_KEYS);
const MALFORMED_SENTINEL_VALUES = new Set(['true', 'false']);

/** Returns true when the raw env value is safe to parse as a disable list. */
const isValidEmergencyDisableValue = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (MALFORMED_SENTINEL_VALUES.has(trimmed.toLowerCase())) {
    return false;
  }

  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return false;
  }

  return true;
};

/**
 * Parses EMERGENCY_DISABLED_CAPABILITIES into a validated disable set.
 * Malformed values fail closed by applying zero emergency disables.
 */
const parseEmergencyDisabledCapabilities = (env = process.env, options = {}) => {
  const log = options.log || console;
  const rawValue = env[EMERGENCY_DISABLED_ENV_KEY];

  if (rawValue === undefined || rawValue === '') {
    return {
      disabledKeys: new Set(),
      malformed: false,
      ignoredUnknownKeys: [],
    };
  }

  if (!isValidEmergencyDisableValue(rawValue)) {
    log.error?.(
      `[capabilities] malformed ${EMERGENCY_DISABLED_ENV_KEY}; applying zero emergency disables`
    );
    return {
      disabledKeys: new Set(),
      malformed: true,
      ignoredUnknownKeys: [],
    };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return {
      disabledKeys: new Set(),
      malformed: false,
      ignoredUnknownKeys: [],
    };
  }

  const disabledKeys = new Set();
  const ignoredUnknownKeys = [];

  for (const entry of trimmed.split(',')) {
    const capabilityKey = entry.trim();
    if (!capabilityKey) {
      continue;
    }

    if (!KNOWN_CAPABILITY_KEY_SET.has(capabilityKey)) {
      ignoredUnknownKeys.push(capabilityKey);
      continue;
    }

    disabledKeys.add(capabilityKey);
  }

  for (const capabilityKey of ignoredUnknownKeys) {
    log.warn?.(
      `[capabilities] ignoring unknown emergency disable key ${JSON.stringify(capabilityKey)}`
    );
  }

  return {
    disabledKeys,
    malformed: false,
    ignoredUnknownKeys,
  };
};

/** Returns true when a capability key is emergency-disabled for this deployment. */
const isEmergencyDisabledCapability = (capabilityKey, env = process.env, options = {}) => {
  const { disabledKeys } = parseEmergencyDisabledCapabilities(env, options);
  return disabledKeys.has(capabilityKey);
};

/** Logs the active emergency disable set once at startup. */
const logEmergencyCapabilityOverrides = (env = process.env, options = {}) => {
  const log = options.log || console;
  const target = options.target || env.SERVER_TARGET || 'local';
  const { disabledKeys, malformed } = parseEmergencyDisabledCapabilities(env, options);

  if (malformed) {
    return;
  }

  const disabledList = [...disabledKeys].sort();
  if (disabledList.length === 0) {
    return;
  }

  log.info?.(
    `[capabilities] emergency_disabled=${JSON.stringify(disabledList)} target=${target}`
  );
};

module.exports = {
  EMERGENCY_DISABLED_ENV_KEY,
  isEmergencyDisabledCapability,
  isValidEmergencyDisableValue,
  logEmergencyCapabilityOverrides,
  parseEmergencyDisabledCapabilities,
};
