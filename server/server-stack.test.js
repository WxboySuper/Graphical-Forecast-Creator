'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

/** @param {import('node:http').Server} server */
const getServerPort = (server) => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP port.');
  }
  return address.port;
};

describe('analytics server stack (express 5)', () => {
  /** @type {import('node:http').Server | undefined} */
  let server = undefined;

  before(async () => {
    const express = require('express');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { registerBillingRoutes } = require('./billing');
    const { registerBetaRoutes } = require('./beta');
    const { registerMetricsRoutes } = require('./metrics');
    const { registerSentryTunnelRoutes } = require('./sentry-tunnel');
    const rateLimit = require('express-rate-limit');

    const logFile = path.join(os.tmpdir(), `gfc-analytics-test-${process.pid}.log`);

    const app = express();
    app.set('trust proxy', 'loopback');

    registerSentryTunnelRoutes(app, express, rateLimit);
    registerBillingRoutes(app, express);
    registerMetricsRoutes(app, express);
    registerBetaRoutes(app, express);

    app.post('/collect', express.json({ limit: '1kb' }), (req, res) => {
      const page = (typeof req.body?.page === 'string' ? req.body.page : '/').slice(0, 200);
      fs.appendFileSync(logFile, `${JSON.stringify({ page })}\n`);
      res.status(204).end();
    });

    app.use((_req, res) => res.status(404).end());

    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.on('error', reject);
    });
  });

  after(() => {
    server?.close();
  });

  it('serves billing config on GET /api/billing/config', async () => {
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/billing/config`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.billingEnabled, 'boolean');
  });

  it('accepts POST /collect with express.json middleware', async () => {
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/collect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: '/forecast', referrer: '' }),
    });
    assert.equal(response.status, 204);
  });
});
