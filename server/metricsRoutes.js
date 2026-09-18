'use strict';

const rateLimit = require('express-rate-limit');

const METRICS_RATE_LIMIT_OPTIONS = {
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many metrics events right now. Please wait a moment and try again.' },
};
const ADMIN_RATE_LIMIT_OPTIONS = {
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin metric requests right now. Please wait a moment and try again.' },
};
const METRICS_RATE_LIMIT = rateLimit(METRICS_RATE_LIMIT_OPTIONS);
const ADMIN_RATE_LIMIT = rateLimit(ADMIN_RATE_LIMIT_OPTIONS);

/** Registers product-metrics and private admin-metrics endpoints. */
const registerMetricsRoutes = (dependencies) => {
  const {
    app,
    express,
    handleMetricEvent,
    handleAdminMetrics,
  } = dependencies;
  app.post('/api/metrics/event', METRICS_RATE_LIMIT, express.json({ limit: '2kb' }), async (req, res) => {
    try {
      await handleMetricEvent(req, res);
    } catch (error) {
      console.error('[metrics] event:error', error);
      res.status(500).json({ error: 'Unable to record metrics right now.' });
    }
  });

  app.get('/api/admin/metrics', ADMIN_RATE_LIMIT, async (req, res) => {
    try {
      await handleAdminMetrics(req, res);
    } catch (error) {
      console.error('[metrics] admin:error', error);
      res.status(500).json({ error: 'Unable to read admin metrics right now.' });
    }
  });
};

module.exports = {
  ADMIN_RATE_LIMIT_OPTIONS,
  METRICS_RATE_LIMIT_OPTIONS,
  registerMetricsRoutes,
};
