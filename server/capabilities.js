'use strict';

const { getPublicCapabilityStatus } = require('./lib/capabilityStatus');
const { logEmergencyCapabilityOverrides } = require('./lib/emergencyCapabilityOverrides');
const { getServerTarget } = require('./lib/serverTarget');

/** Registers the public capability status endpoint for server-backed features. */
const registerCapabilityRoutes = (app, options = {}) => {
  const env = options.env || process.env;

  app.get('/api/capabilities/status', (_req, res) => {
    res.status(200).json(getPublicCapabilityStatus({
      env,
      target: options.target,
    }));
  });
};

/** Logs active emergency disable overrides once during server startup. */
const logCapabilityStartupState = (env = process.env) => {
  logEmergencyCapabilityOverrides(env, { target: getServerTarget(env) });
};

module.exports = {
  logCapabilityStartupState,
  registerCapabilityRoutes,
};
