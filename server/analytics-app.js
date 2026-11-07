'use strict';

const { setupExpressErrorHandler } = require('./sentry');
const { timingSafeEqual } = require('node:crypto');
const net = require('node:net');

const WORKER_CLIENT_IP_HEADER = 'x-gfc-worker-client-ip';
const WORKER_SECRET_HEADER = 'x-gfc-worker-secret';

/** True when the supplied value equals the configured secret, compared in constant time. */
const matchesSharedSecret = (expectedSecret, suppliedSecret) => {
  const expected = Buffer.from(expectedSecret || '');
  const supplied = Buffer.from(suppliedSecret || '');
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
};

/** Uses a Worker-provided address only when the request proves it knows the shared secret. */
function trustBetaWorkerClientIp(req, _res, next) {
  const clientIp = req.get(WORKER_CLIENT_IP_HEADER);
  const secretMatches = matchesSharedSecret(process.env.BETA_WORKER_SHARED_SECRET, req.get(WORKER_SECRET_HEADER));

  if (secretMatches && net.isIP(clientIp || '')) {
    Object.defineProperty(req, 'ip', { configurable: true, value: clientIp });
  }

  next();
}

/** Registers middleware and the hosted product routes. */
function configureApp(app, express) {
  const rateLimit = require('express-rate-limit');
  const { registerBetaRoutes } = require('./beta');
  const { registerAccountLifecycleRoutes } = require('./account-lifecycle');
  const { registerBillingRoutes } = require('./billing');
  const { registerCapabilityRoutes } = require('./capabilities');
  const { registerCloudCycleRoutes } = require('./cloud-cycles');
  const { registerMetricsRoutes } = require('./metrics');
  const { registerSentryTunnelRoutes } = require('./sentry-tunnel');
  const { registerTstmIngestion, registerTstmRoutes } = require('./tstm');

  app.set('trust proxy', 'loopback');
  app.use(trustBetaWorkerClientIp);

  registerSentryTunnelRoutes(app, express, rateLimit);
  registerBillingRoutes(app, express);
  registerMetricsRoutes(app, express);
  registerBetaRoutes(app, express);
  registerCapabilityRoutes(app);
  registerCloudCycleRoutes(app, express, rateLimit);
  registerTstmRoutes(app, express);
  registerTstmIngestion(app, express);
  registerAccountLifecycleRoutes(app, express);

  setupExpressErrorHandler(app);

  // Reject everything else quietly
  app.use((_req, res) => res.status(404).end());
}

module.exports = {
  configureApp,
  trustBetaWorkerClientIp,
};
