'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureApp } = require('./analytics-app');

/** @param {import('node:http').Server} server */
const getServerPort = (server) => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP port.');
  }
  return address.port;
};

/** @returns {Promise<import('node:http').Server>} */
const startTestAnalyticsServer = async (beforeConfigure = () => {}) => {
  const express = require('express');
  const app = express();
  beforeConfigure(app);
  configureApp(app, express);

  return new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
};

describe('analytics server stack (express 5)', () => {
  const serverReady = startTestAnalyticsServer();

  after(async () => {
    const server = await serverReady;
    server.close();
  });

  it('serves billing config on GET /api/billing/config', async () => {
    const server = await serverReady;
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/billing/config`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.billingEnabled, 'boolean');

    // Schema snapshot: the public billing config exposes only the allowlisted
    // client-facing fields; price IDs and provider internals never serialize.
    assert.deepEqual(Object.keys(body).sort(), [
      'annualDisplayPrice',
      'annualPromoActive',
      'billingEnabled',
      'checkoutEnabled',
      'monthlyDisplayPrice',
    ]);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('priceId'), false);
    assert.equal(serialized.includes('secret'), false);
    assert.equal(serialized.includes('baseUrl'), false);
  });

  it('serves capability status on GET /api/capabilities/status', async () => {
    const server = await serverReady;
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/capabilities/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.capabilities, 'object');

    // Schema snapshot: the public envelope and every capability entry must stay
    // exactly { capabilities: { key: { available, reason } } }. Adding fields here
    // intentionally fails so the public schema cannot grow through incidental
    // internal serialization.
    assert.deepEqual(Object.keys(body).sort(), ['capabilities']);
    for (const entry of Object.values(body.capabilities)) {
      assert.deepEqual(Object.keys(entry).sort(), ['available', 'reason']);
      assert.equal(typeof entry.available, 'boolean');
      assert.equal(typeof entry.reason, 'string');
    }
  });

  it('does not expose the retired POST /collect telemetry endpoint', async () => {
    const server = await serverReady;
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/collect`, { method: 'POST' });
    assert.equal(response.status, 404);
  });

  it('disables X-Powered-By and returns JSON without an error stack', async () => {
    const server = await startTestAnalyticsServer((app) => {
      app.get('/test-error', () => { throw new Error('private stack marker'); });
    });
    const port = getServerPort(server);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/test-error`);
      assert.equal(response.status, 500);
      assert.equal(response.headers.get('x-powered-by'), null);
      assert.deepEqual(await response.json(), { error: 'Internal server error.' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
