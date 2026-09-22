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

/** Builds limiters from the exported option objects; production uses the singletons above. */
const createRateLimiters = (createRateLimiter = rateLimit) => ({
  metricsRateLimit: createRateLimiter(METRICS_RATE_LIMIT_OPTIONS),
  adminRateLimit: createRateLimiter(ADMIN_RATE_LIMIT_OPTIONS),
});

/** Wraps the metric-event handler with the shared safe-error response. */
const createMetricEventRoute = (handleMetricEvent) => async (req, res) => {
  try {
    await handleMetricEvent(req, res);
  } catch (error) {
    console.error('[metrics] event:error', error);
    res.status(500).json({ error: 'Unable to record metrics right now.' });
  }
};

/** Wraps the admin-metrics handler with the shared safe-error response. */
const createAdminMetricsRoute = (handleAdminMetrics) => async (req, res) => {
  try {
    await handleAdminMetrics(req, res);
  } catch (error) {
    console.error('[metrics] admin:error', error);
    res.status(500).json({ error: 'Unable to read admin metrics right now.' });
  }
};

/** Registers product-metrics and private admin-metrics endpoints. */
const registerMetricsRoutes = (dependencies) => {
  const {
    app,
    express,
    handleMetricEvent,
    handleAdminMetrics,
    createRateLimiter,
  } = dependencies;
  const { metricsRateLimit, adminRateLimit } = createRateLimiter
    ? createRateLimiters(createRateLimiter)
    : { metricsRateLimit: METRICS_RATE_LIMIT, adminRateLimit: ADMIN_RATE_LIMIT };
  app.post('/api/metrics/event', metricsRateLimit, express.json({ limit: '2kb' }), createMetricEventRoute(handleMetricEvent));

  app.get('/api/admin/metrics', adminRateLimit, createAdminMetricsRoute(handleAdminMetrics));
};

module.exports = {
  ADMIN_RATE_LIMIT,
  ADMIN_RATE_LIMIT_OPTIONS,
  METRICS_RATE_LIMIT,
  METRICS_RATE_LIMIT_OPTIONS,
  createAdminMetricsRoute,
  createMetricEventRoute,
  createRateLimiters,
  registerMetricsRoutes,
};
