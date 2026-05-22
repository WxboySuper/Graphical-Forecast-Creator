'use strict';

const SENTRY_INGEST_HOST_PATTERN = /^o\d+\.ingest(\.[a-z]{2})?\.sentry\.io$/i;

/** @returns {URL | null} DSN parsed from the first envelope header line. */
function parseEnvelopeDsn(envelopeBody) {
  const firstLine = envelopeBody.toString('utf8').split('\n').find((line) => line.trim());
  if (!firstLine) {
    return null;
  }

  const header = JSON.parse(firstLine);
  if (!header?.dsn || typeof header.dsn !== 'string') {
    return null;
  }

  return new URL(header.dsn);
}

/** @returns {boolean} Whether the DSN host is a known Sentry ingest endpoint. */
function isAllowedSentryHost(hostname) {
  return SENTRY_INGEST_HOST_PATTERN.test(hostname);
}

/** @returns {string | null} Upstream envelope URL for a validated Sentry DSN. */
function buildEnvelopeUrl(dsn) {
  if (dsn.protocol !== 'https:') {
    return null;
  }

  const projectId = dsn.pathname.replace(/^\//, '');
  if (!/^\d+$/.test(projectId)) {
    return null;
  }

  return `https://${dsn.hostname}/api/${projectId}/envelope/`;
}

/** Registers POST /api/sentry-tunnel to proxy browser envelopes past ad blockers. */
function registerSentryTunnelRoutes(app, express, rateLimit) {
  const tunnelRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post(
    '/api/sentry-tunnel',
    express.raw({ type: () => true, limit: '2mb' }),
    tunnelRateLimit,
    async (req, res) => {
      try {
        const envelopeBody = req.body;
        if (!envelopeBody || !envelopeBody.length) {
          res.status(400).end();
          return;
        }

        const dsn = parseEnvelopeDsn(envelopeBody);
        if (!dsn || !isAllowedSentryHost(dsn.hostname)) {
          res.status(400).end();
          return;
        }

        const targetUrl = buildEnvelopeUrl(dsn);
        if (!targetUrl) {
          res.status(400).end();
          return;
        }

        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-sentry-envelope',
          },
          body: envelopeBody,
        });

        res.status(upstream.status).end();
      } catch (err) {
        console.error('[analytics] sentry tunnel failed:', err);
        res.status(500).end();
      }
    }
  );
}

module.exports = {
  registerSentryTunnelRoutes,
  parseEnvelopeDsn,
  isAllowedSentryHost,
  buildEnvelopeUrl,
};
