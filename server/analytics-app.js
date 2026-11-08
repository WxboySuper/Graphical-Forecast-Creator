'use strict';

const { setupExpressErrorHandler } = require('./sentry');
const { createHash, timingSafeEqual } = require('node:crypto');
const net = require('node:net');

const WORKER_CLIENT_IP_HEADER = 'x-gfc-worker-client-ip';
const WORKER_SECRET_HEADER = 'x-gfc-worker-secret';

/** True when the supplied value equals the configured secret, compared in constant time. */
const matchesSharedSecret = (expectedSecret, suppliedSecret) => {
  if (!expectedSecret) return false;
  // Hash both values so differing lengths still compare as equal-length digests.
  const digest = (value) => createHash('sha256').update(String(value || ''), 'utf8').digest();
  return timingSafeEqual(digest(expectedSecret), digest(suppliedSecret));
};

/** Returns the Worker-forwarded client IP when the request proves the shared secret, else null. */
const getTrustedWorkerClientIp = (req) => {
  const secret = process.env.BETA_WORKER_SHARED_SECRET;
  if (!matchesSharedSecret(secret, req.get(WORKER_SECRET_HEADER))) return null;
  const clientIp = req.get(WORKER_CLIENT_IP_HEADER) || '';
  return net.isIP(clientIp) ? clientIp : null;
};

/** Uses a Worker-provided address only when the request proves it knows the shared secret. */
function trustBetaWorkerClientIp(req, _res, next) {
  const clientIp = getTrustedWorkerClientIp(req);
  if (clientIp) {
    Object.defineProperty(req, 'ip', { configurable: true, value: clientIp });
  }
  next();
}

/** Registers middleware and the hosted product routes. */
function configureApp(app, express) {
  const rateLimit = require('express-rate-limit');
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
