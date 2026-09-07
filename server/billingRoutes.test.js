'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { registerBillingRoutes } = require('./billingRoutes');

describe('billing route adapter', () => {
  it('registers config, webhook, checkout, and portal routes', () => {
    const routes = [];
    const app = {
      get: (...args) => routes.push(['get', ...args]),
      post: (...args) => routes.push(['post', ...args]),
    };
    const express = {
      raw: (options) => ({ kind: 'raw', options }),
      json: (options) => ({ kind: 'json', options }),
    };
    const handlers = {
      handleBillingConfig: () => {},
      handleBillingWebhook: () => {},
      handleCheckout: () => {},
      handleBillingPortal: () => {},
      wrapBillingJsonRoute: ({ handler }) => handler,
    };

    registerBillingRoutes({
      app,
      express,
      webhookRateLimit: 'webhook-limit',
      checkoutRateLimit: 'checkout-limit',
      portalRateLimit: 'portal-limit',
      ...handlers,
    });

    assert.deepEqual(routes.map(([method, path]) => [method, path]), [
      ['get', '/api/billing/config'],
      ['post', '/api/billing/webhook'],
      ['post', '/api/billing/checkout'],
      ['post', '/api/billing/portal'],
    ]);
    assert.deepEqual(routes[1][3], { kind: 'raw', options: { type: 'application/json' } });
    assert.deepEqual(routes[2][3], { kind: 'json', options: { limit: '8kb' } });
    assert.deepEqual(routes[3][3], { kind: 'json', options: { limit: '8kb' } });
  });
});
