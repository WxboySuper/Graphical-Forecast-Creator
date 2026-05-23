'use strict';

const { describe, it, before, after } = require('node:test');
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

describe('analytics server stack (express 5)', () => {
  /** @type {import('node:http').Server | undefined} */
  let server;

  before(async () => {
    const express = require('express');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');

    const logFile = path.join(os.tmpdir(), `gfc-analytics-test-${process.pid}.log`);

    const app = express();
    configureApp(app, express, fs, logFile);

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
