'use strict';

const { getServerTarget } = require('./serverTarget');
const { SERVER_FEATURE_EXPOSURE_REGISTRY } = require('./serverFeatureExposure');

const DISABLED_CAPABILITY_STATUS = 404;

/** Returns the server-backed feature entry for a capability key, if declared. */
const findFeatureByCapabilityKey = (capabilityKey) => {
  for (const [featureKey, definition] of Object.entries(SERVER_FEATURE_EXPOSURE_REGISTRY)) {
    if (definition.serverCapabilityKey === capabilityKey) {
      return { featureKey, definition };
    }
  }

  return null;
};

/** Returns true when ops explicitly enabled the deployment capability env switch. */
const isDeploymentCapabilityEnabled = (capabilityKey, env = process.env) =>
  env[capabilityKey] === 'true';

/**
 * Returns true when registry exposure and the deployment capability env are both enabled.
 * Authorization is intentionally separate and must run after this gate.
 */
const isServerCapabilityEnabled = (capabilityKey, options = {}) => {
  const env = options.env || process.env;
  const feature = findFeatureByCapabilityKey(capabilityKey);

  if (!feature) {
    return false;
  }

  const target = options.target ?? getServerTarget(env);
  const exposureOverride = options.exposureOverride?.[target];
  const exposedOnTarget =
    typeof exposureOverride === 'boolean'
      ? exposureOverride
      : feature.definition.exposure[target] === true;

  if (!exposedOnTarget) {
    return false;
  }

  return isDeploymentCapabilityEnabled(capabilityKey, env);
};

/** Sends the standard fail-closed response for disabled experimental APIs. */
const sendDisabledCapabilityResponse = (res, { label }) => {
  res.status(DISABLED_CAPABILITY_STATUS).json({
    error: `${label} is not enabled on this deployment.`,
  });
};

/** Rejects disabled capabilities before route handlers, auth, or expensive work run. */
const createServerCapabilityGate = (capabilityKey, options = {}) => {
  const env = options.env || process.env;
  const feature = findFeatureByCapabilityKey(capabilityKey);
  const label = options.label || feature?.definition?.label || 'This capability';

  return (_req, res, next) => {
    if (!isServerCapabilityEnabled(capabilityKey, {
      env,
      target: options.target,
      exposureOverride: options.exposureOverride,
    })) {
      sendDisabledCapabilityResponse(res, { label });
      return;
    }

    next();
  };
};

module.exports = {
  DISABLED_CAPABILITY_STATUS,
  createServerCapabilityGate,
  findFeatureByCapabilityKey,
  isDeploymentCapabilityEnabled,
  isServerCapabilityEnabled,
  sendDisabledCapabilityResponse,
};
