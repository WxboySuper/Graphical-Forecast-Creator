'use strict';

/** Registers product-metrics and private admin-metrics endpoints. */
const registerMetricsRoutes = ({
  app,
  express,
  metricsRateLimit,
  adminRateLimit,
  handleMetricEvent,
  handleAdminMetrics,
}) => {
  app.post('/api/metrics/event', metricsRateLimit, express.json({ limit: '2kb' }), async (req, res) => {
    try {
      await handleMetricEvent(req, res);
    } catch (error) {
      console.error('[metrics] event:error', error);
      res.status(500).json({ error: 'Unable to record metrics right now.' });
    }
  });

  app.get('/api/admin/metrics', adminRateLimit, async (req, res) => {
    try {
      await handleAdminMetrics(req, res);
    } catch (error) {
      console.error('[metrics] admin:error', error);
      res.status(500).json({ error: 'Unable to read admin metrics right now.' });
    }
  });
};

module.exports = { registerMetricsRoutes };
