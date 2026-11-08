'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { trustBetaWorkerClientIp } = require('./analytics-app');

const middlewareRequest = (headers, ip = '127.0.0.1') => ({
  ip,
  get: (name) => headers[name.toLowerCase()],
});

test('uses the beta Worker client IP only with the configured shared secret', () => {
  const previousSecret = process.env.BETA_WORKER_SHARED_SECRET;
  process.env.BETA_WORKER_SHARED_SECRET = 'expected-secret';
  try {
    const req = middlewareRequest({
      'x-gfc-worker-client-ip': '203.0.113.8',
      'x-gfc-worker-secret': 'expected-secret',
    });
    let continued = false;

    trustBetaWorkerClientIp(req, {}, () => { continued = true; });

    assert.equal(req.ip, '203.0.113.8');
    assert.equal(continued, true);
  } finally {
    if (previousSecret === undefined) delete process.env.BETA_WORKER_SHARED_SECRET;
    else process.env.BETA_WORKER_SHARED_SECRET = previousSecret;
  }
});

test('ignores spoofed or invalid Worker identity headers', () => {
  const previousSecret = process.env.BETA_WORKER_SHARED_SECRET;
  process.env.BETA_WORKER_SHARED_SECRET = 'expected-secret';
  try {
    for (const headers of [
      { 'x-gfc-worker-client-ip': '203.0.113.8', 'x-gfc-worker-secret': 'wrong-secret' },
      { 'x-gfc-worker-client-ip': '203.0.113.8, 198.51.100.2', 'x-gfc-worker-secret': 'expected-secret' },
      { 'x-gfc-worker-client-ip': 'not-an-ip', 'x-gfc-worker-secret': 'expected-secret' },
    ]) {
      const req = middlewareRequest(headers, '10.0.0.3');
      trustBetaWorkerClientIp(req, {}, () => {});
      assert.equal(req.ip, '10.0.0.3');
    }
  } finally {
    if (previousSecret === undefined) delete process.env.BETA_WORKER_SHARED_SECRET;
    else process.env.BETA_WORKER_SHARED_SECRET = previousSecret;
  }
});

test('ignores Worker identity headers when the secret is not configured', () => {
  const previousSecret = process.env.BETA_WORKER_SHARED_SECRET;
  delete process.env.BETA_WORKER_SHARED_SECRET;
  try {
    const req = middlewareRequest({
      'x-gfc-worker-client-ip': '203.0.113.8',
      'x-gfc-worker-secret': 'attacker-value',
    }, '10.0.0.3');
    trustBetaWorkerClientIp(req, {}, () => {});
    assert.equal(req.ip, '10.0.0.3');
  } finally {
    if (previousSecret !== undefined) process.env.BETA_WORKER_SHARED_SECRET = previousSecret;
  }
});

test('gives separate rate-limit allowances to different trusted Worker client IPs', async () => {
  const express = require('express');
  const rateLimit = require('express-rate-limit');
  const previousSecret = process.env.BETA_WORKER_SHARED_SECRET;
  process.env.BETA_WORKER_SHARED_SECRET = 'expected-secret';

  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(trustBetaWorkerClientIp);
  app.use(rateLimit({ windowMs: 60_000, limit: 1, standardHeaders: false, legacyHeaders: false }));
  app.get('/', (_req, res) => res.sendStatus(200));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address();
  const request = async (clientIp) => (await fetch(`http://127.0.0.1:${port}/`, {
    headers: { 'x-gfc-worker-client-ip': clientIp, 'x-gfc-worker-secret': 'expected-secret' },
  })).status;

  try {
    assert.equal(await request('203.0.113.8'), 200);
    assert.equal(await request('203.0.113.8'), 429);
    assert.equal(await request('203.0.113.9'), 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.BETA_WORKER_SHARED_SECRET;
    else process.env.BETA_WORKER_SHARED_SECRET = previousSecret;
  }
});
