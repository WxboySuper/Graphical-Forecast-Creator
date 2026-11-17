/**
 * Server read of the shared flag registry (server/flags.json, also imported by the client).
 * A flag with a `capability` is a server-backed feature; its availability is decided in
 * capabilityStatus.js from the target value here plus the deployment and emergency switches.
 */
'use strict';

const registry = require('../flags.json');

/** Returns a flag's value for a target, or its default; an unknown flag reads as off. */
const resolveFlag = (name, target) => {
  const entry = registry.flags[name];
  if (!entry) {
    return false;
  }

  const value = entry.values ? entry.values[target] : undefined;
  return value === undefined ? entry.default : value;
};

/** Server-backed flags keyed by flag name, with the resolved on/off value for every target. */
const SERVER_FEATURES = Object.fromEntries(
  Object.entries(registry.flags)
    .filter(([, entry]) => entry.capability)
    .map(([name, entry]) => [
      name,
      {
        serverCapabilityKey: entry.capability,
        label: entry.label,
        exposure: Object.fromEntries(registry.targets.map((target) => [target, resolveFlag(name, target) === true])),
      },
    ])
);

const KNOWN_SERVER_CAPABILITY_KEYS = Object.values(SERVER_FEATURES).map((feature) => feature.serverCapabilityKey);

module.exports = {
  KNOWN_SERVER_CAPABILITY_KEYS,
  SERVER_FEATURES,
  resolveFlag,
};
