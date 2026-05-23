'use strict';

const { initSentry } = require('./sentry');
const { configureApp } = require('./analytics-app');

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

  const app = express();
  configureApp(app, express, fs, LOG_FILE);

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
