'use strict';

const SENTRY_DSN_PATTERN =
  /^https:\/\/(?:[^@/]+@)?(o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io)\/(\d+)\/?$/iu;

/** @returns {{ host: string, projectId: string } | null} Parsed ingest target from a Sentry DSN string. */
function parseSentryDsnString(dsnString) {
  if (!dsnString || typeof dsnString !== 'string') {
    return null;
  }

  const match = dsnString.trim().match(SENTRY_DSN_PATTERN);
  if (!match) {
    return null;
  }

  return {
    host: match[1],
    projectId: match[2],
  };
}

/** @returns {{ host: string, projectId: string } | null} Parsed Sentry ingest target from an envelope header DSN. */
function parseAllowedSentryEndpoint(envelopeBody) {
  const firstLine = envelopeBody.toString('utf8').split('\n').find((line) => line.trim());
  if (!firstLine) {
    return null;
  }

  const header = JSON.parse(firstLine);
  if (!header?.dsn || typeof header.dsn !== 'string') {
    return null;
  }

  return parseSentryDsnString(header.dsn);
}

/** @returns {string} Upstream envelope URL for a validated Sentry host and project id. */
function buildEnvelopeUrl(host, projectId) {
  return `https://${host}/api/${projectId}/envelope/`;
}

/** @returns {boolean} Whether the DSN host is a known Sentry ingest endpoint. */
function isAllowedSentryHost(hostname) {
  return SENTRY_DSN_PATTERN.test(`https://${hostname}/0`);
}

/** @returns {{ host: string, projectId: string } | null} Server-configured Sentry ingest target. */
function getConfiguredSentryEndpoint() {
  return parseSentryDsnString(process.env.SENTRY_DSN || '');
}

/** Registers POST /api/sentry-tunnel to proxy browser envelopes past ad blockers. */
function registerSentryTunnelRoutes(app, express, rateLimit) {
  const configuredEndpoint = getConfiguredSentryEndpoint();
  if (!configuredEndpoint) {
    console.warn('[analytics] sentry tunnel disabled: SENTRY_DSN is missing or invalid');
    return;
  }

  const targetUrl = buildEnvelopeUrl(configuredEndpoint.host, configuredEndpoint.projectId);

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

        const clientEndpoint = parseAllowedSentryEndpoint(envelopeBody);
        if (
          !clientEndpoint ||
          clientEndpoint.host !== configuredEndpoint.host ||
          clientEndpoint.projectId !== configuredEndpoint.projectId
        ) {
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
  parseAllowedSentryEndpoint,
  parseSentryDsnString,
  isAllowedSentryHost,
  buildEnvelopeUrl,
  getConfiguredSentryEndpoint,
};
