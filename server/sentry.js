'use strict';

/** @returns {boolean} Whether Sentry was initialized for this process. */
function initSentry() {
  const dsn = (process.env.SENTRY_DSN || '').trim();
  if (!dsn) {
    return false;
  }

  const Sentry = require('@sentry/node');
  const release = (process.env.SENTRY_RELEASE || '').trim() || undefined;
  const environment = (process.env.SENTRY_ENVIRONMENT || 'production').trim() || 'production';
  const tracesSampleRate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');

  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
  });

  return true;
}

/** Registers the Express error handler when Sentry is configured. */
function setupExpressErrorHandler(app) {
  if (!(process.env.SENTRY_DSN || '').trim()) {
    return;
  }

  const Sentry = require('@sentry/node');
  Sentry.setupExpressErrorHandler(app);
}

module.exports = {
  initSentry,
  setupExpressErrorHandler,
};
