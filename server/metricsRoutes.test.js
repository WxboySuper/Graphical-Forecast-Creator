'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ADMIN_RATE_LIMIT_OPTIONS,
  METRICS_RATE_LIMIT_OPTIONS,
  registerMetricsRoutes,
} = require('./metricsRoutes');

describe('metrics route adapter', () => {
  it('registers both endpoints with the supplied handlers and limits', async () => {
    const routes = [];
    const app = {
      post: (...args) => routes.push(['post', ...args]),
      get: (...args) => routes.push(['get', ...args]),
    };
    const express = { json: (options) => ({ kind: 'json', options }) };
    let metricCalls = 0;
    let adminCalls = 0;
    const handleMetricEvent = async () => { metricCalls += 1; };
    const handleAdminMetrics = async () => { adminCalls += 1; };

    registerMetricsRoutes({
      app,
      express,
      handleMetricEvent,
      handleAdminMetrics,
    });

    assert.equal(routes.length, 2);
    assert.equal(routes[0][0], 'post');
    assert.equal(routes[0][1], '/api/metrics/event');
    assert.equal(typeof routes[0][2], 'function');
    assert.deepEqual(routes[0][3], { kind: 'json', options: { limit: '2kb' } });
    await routes[0][4]({}, {});
    assert.equal(routes[1][0], 'get');
    assert.equal(routes[1][1], '/api/admin/metrics');
    assert.equal(typeof routes[1][2], 'function');
    await routes[1][3]({}, {});
    assert.equal(metricCalls, 1);
    assert.equal(adminCalls, 1);
  });

  it('keeps the documented rate limits attached to each endpoint', () => {
    assert.deepEqual(METRICS_RATE_LIMIT_OPTIONS, {
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many metrics events right now. Please wait a moment and try again.' },
    });
    assert.deepEqual(ADMIN_RATE_LIMIT_OPTIONS, {
      windowMs: 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many admin metric requests right now. Please wait a moment and try again.' },
    });
  });
});
