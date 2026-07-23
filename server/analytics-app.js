'use strict';

const { setupExpressErrorHandler } = require('./sentry');

/** Returns the POST /collect handler that appends sanitized entries to the log file. */
function createCollectHandler(fs, LOG_FILE) {
  return (req, res) => {
    // Sanitise and cap all user-controlled fields
    const page = (typeof req.body?.page === 'string' ? req.body.page : '/').slice(0, 200);
    const referrer = (typeof req.body?.referrer === 'string' ? req.body.referrer : '').slice(0, 500);

    const entry = {
      ts: new Date().toISOString(),
      ua: (req.headers['user-agent'] || '').slice(0, 300),
      page,
      ref: referrer,
    };

    try {
      fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`);
      res.status(204).end();
    } catch (err) {
      console.error('[analytics] failed to write log:', err);
      res.status(500).end();
    }
  };
}

/** Registers middleware, billing/metrics/beta routes, and the collect endpoint. */
function configureApp(app, express, fs, LOG_FILE) {
  const rateLimit = require('express-rate-limit');
  const { registerBetaRoutes } = require('./beta');
  const { registerAccountLifecycleRoutes } = require('./account-lifecycle');
  const { registerBillingRoutes } = require('./billing');
  const { registerMetricsRoutes } = require('./metrics');
  const { registerSentryTunnelRoutes } = require('./sentry-tunnel');

  app.set('trust proxy', 'loopback');

  const collectRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  registerSentryTunnelRoutes(app, express, rateLimit);
  registerBillingRoutes(app, express);
  registerMetricsRoutes(app, express);
  registerBetaRoutes(app, express);
  registerAccountLifecycleRoutes(app, express);

  app.post('/collect', express.json({ limit: '1kb' }), collectRateLimit, createCollectHandler(fs, LOG_FILE));

  setupExpressErrorHandler(app);

  // Reject everything else quietly
  app.use((_req, res) => res.status(404).end());
}

module.exports = {
  configureApp,
};
