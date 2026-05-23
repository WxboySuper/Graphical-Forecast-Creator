'use strict';

const { initSentry, setupExpressErrorHandler } = require('./sentry');

const { initSentry, setupExpressErrorHandler } = require('./sentry');
initSentry();

const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { registerBetaRoutes } = require('./beta');
const { registerBillingRoutes } = require('./billing');
const { registerMetricsRoutes } = require('./metrics');
const { registerSentryTunnelRoutes } = require('./sentry-tunnel');

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
  const { registerBillingRoutes } = require('./billing');
  const { registerMetricsRoutes } = require('./metrics');
  const { registerSentryTunnelRoutes } = require('./sentry-tunnel');

registerSentryTunnelRoutes(app, express, rateLimit);

registerBillingRoutes(app, express);
registerMetricsRoutes(app, express);
registerBetaRoutes(app, express);

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

  app.post('/collect', express.json({ limit: '1kb' }), collectRateLimit, createCollectHandler(fs, LOG_FILE));

  setupExpressErrorHandler(app);

  // Reject everything else quietly
  app.use((_req, res) => res.status(404).end());
}

/** Loads env vars, creates the Express app, and binds the analytics server. */
async function start() {
  const loadEnv = require('./load-env');
  await loadEnv();
  initSentry();

  const express = require('express');
  const fs = require('fs');
  const path = require('path');

  const PORT = parseInt(process.env.PORT || '3006', 10);
  const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'analytics.log');

  // Ensure log directory exists on startup
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

setupExpressErrorHandler(app);

// Reject everything else quietly
app.use((_req, res) => res.status(404).end());

  // Bind to loopback only — never exposed to the internet directly (nginx proxies in)
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[analytics] listening on 127.0.0.1:${PORT} (port ${PORT})`);
    console.log(`[analytics] writing to ${LOG_FILE}`);
  });
}

start().catch((err) => {
  console.error('[analytics] startup failed:', err);
  process.exit(1);
});
