'use strict';

const { setupExpressErrorHandler } = require('./sentry');

const ALLOWED_ANALYTICS_EVENTS = new Set(['start', 'continue', 'derive', 'revise', 'complete', 'complete-with-omissions', 'export', 'rollover-action']);
const ALLOWED_ANALYTICS_DIMENSION_VALUES = {
  dayGrouping: new Set(['day1', 'day2', 'day3', 'day4-8', 'full-cycle']),
  accountTier: new Set(['signed-out', 'free', 'premium']),
  entryPath: new Set(['home', 'forecast', 'cloud-library', 'forecast-workspace', 'rollover']),
  result: new Set(['success', 'failure', 'cancelled']),
  packageScope: new Set(['workflow', 'cycle']),
  action: new Set(['keep', 'save-and-start-new', 'replace-without-saving']),
};

/** Extracts only the closed, metadata-only analytics contract from a request. */
function sanitizeAnalyticsPayload(body) {
  const event = ALLOWED_ANALYTICS_EVENTS.has(body?.event) ? body.event : undefined;
  if (!event || !body?.dimensions || typeof body.dimensions !== 'object' || Array.isArray(body.dimensions)) {
    return event ? { event } : {};
  }
  const dimensions = Object.fromEntries(
    Object.entries(body.dimensions)
      .filter(([key, value]) => ALLOWED_ANALYTICS_DIMENSION_VALUES[key]?.has(value))
      .slice(0, 6),
  );
  return { event, dimensions };
}

/** Returns the POST /collect handler that appends sanitized entries to the log file. */
function createCollectHandler(fs, LOG_FILE) {
  return (req, res) => {
    // Sanitise and cap all user-controlled fields
    const page = (typeof req.body?.page === 'string' ? req.body.page : '/').slice(0, 200);
    const referrer = (typeof req.body?.referrer === 'string' ? req.body.referrer : '').slice(0, 500);
    const analyticsPayload = sanitizeAnalyticsPayload(req.body);

    const entry = {
      ts: new Date().toISOString(),
      ua: (req.headers['user-agent'] || '').slice(0, 300),
      page,
      ref: referrer,
      ...analyticsPayload,
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
  const { registerBillingRoutes } = require('./billing');
  const { registerCapabilityRoutes } = require('./capabilities');
  const { registerMetricsRoutes } = require('./metrics');
  const { registerSentryTunnelRoutes } = require('./sentry-tunnel');
  const { registerTstmIngestion, registerTstmRoutes } = require('./tstm');

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
  registerCapabilityRoutes(app);
  registerTstmRoutes(app, express);
  registerTstmIngestion(app, express);

  app.post('/collect', express.json({ limit: '1kb' }), collectRateLimit, createCollectHandler(fs, LOG_FILE));

  setupExpressErrorHandler(app);

  // Reject everything else quietly
  app.use((_req, res) => res.status(404).end());
}

module.exports = {
  configureApp,
};
