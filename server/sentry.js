'use strict';

<<<<<<< HEAD
=======
/** @returns {string} Trimmed Sentry DSN or empty when unset. */
function getSentryDsn() {
  return (process.env.SENTRY_DSN || '').trim();
}

/** @returns {string | undefined} Release label when configured. */
function getSentryRelease() {
  const release = (process.env.SENTRY_RELEASE || '').trim();
  return release || undefined;
}

/** @returns {string} Sentry environment name. */
function getSentryEnvironment() {
  return (process.env.SENTRY_ENVIRONMENT || 'production').trim() || 'production';
}

/** @returns {number} Trace sample rate clamped to the valid 0–1 range. */
function getTracesSampleRate() {
  const parsed = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
  if (!Number.isFinite(parsed)) {
    return 0.1;
  }
  return Math.max(0, Math.min(1, parsed));
}

/** @returns {object | null} Sentry.init options, or null when no DSN is configured. */
function buildSentryInitOptions() {
  const dsn = getSentryDsn();
  if (!dsn) {
    return null;
  }

  return {
    dsn,
    environment: getSentryEnvironment(),
    release: getSentryRelease(),
    sendDefaultPii: false,
    tracesSampleRate: getTracesSampleRate(),
  };
}

>>>>>>> origin/pr/316
/** @returns {boolean} Whether Sentry was initialized for this process. */
function initSentry() {
  const dsn = (process.env.SENTRY_DSN || '').trim();
  if (!dsn) {
    return false;
  }

  const Sentry = require('@sentry/node');
  const release = (process.env.SENTRY_RELEASE || '').trim() || undefined;
  const environment = (process.env.SENTRY_ENVIRONMENT || 'production').trim();
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
