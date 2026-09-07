'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { registerBillingRoutes } = require('./billingRoutes');

const createApp = (routes) => ({
  get: (...args) => routes.push(['get', ...args]),
  post: (...args) => routes.push(['post', ...args]),
});

const createExpress = () => ({
  raw: (options) => ({ kind: 'raw', options }),
  json: (options) => ({ kind: 'json', options }),
});

describe('billing route adapter', () => {
  it('registers config, webhook, checkout, and portal routes with handler identity and middleware order', () => {
    const routes = [];
    const app = createApp(routes);
    const express = createExpress();
    const handleBillingConfig = () => {};
    const handleBillingWebhook = () => {};
    const handleCheckout = () => {};
    const handleBillingPortal = () => {};
    const webhookRateLimit = function webhookRateLimit() {};
    const checkoutRateLimit = function checkoutRateLimit() {};
    const portalRateLimit = function portalRateLimit() {};
    const wrappedCheckout = () => {};
    const wrappedPortal = () => {};
    const wrapperCalls = [];
    const wrapBillingJsonRoute = (args) => {
      wrapperCalls.push(args);
      if (args.handler === handleCheckout) return wrappedCheckout;
      return wrappedPortal;
    };

    registerBillingRoutes({
      app,
      express,
      webhookRateLimit,
      checkoutRateLimit,
      portalRateLimit,
      handleBillingConfig,
      handleBillingWebhook,
      handleCheckout,
      handleBillingPortal,
      wrapBillingJsonRoute,
    });

    assert.deepStrictEqual(
      routes.map(([method, path]) => [method, path]),
      [
        ['get', '/api/billing/config'],
        ['post', '/api/billing/webhook'],
        ['post', '/api/billing/checkout'],
        ['post', '/api/billing/portal'],
      ],
    );

    // Config keeps the direct handler.
    assert.strictEqual(routes[0].length, 3);
    assert.strictEqual(routes[0][2], handleBillingConfig);

    // Webhook keeps rate limit, raw parser, and handler in order.
    assert.strictEqual(routes[1].length, 5);
    assert.strictEqual(routes[1][2], webhookRateLimit);
    assert.deepStrictEqual(routes[1][3], { kind: 'raw', options: { type: 'application/json' } });
    assert.strictEqual(routes[1][4], handleBillingWebhook);

    // Checkout keeps rate limit, JSON parser, and wrapped handler in order.
    assert.strictEqual(routes[2].length, 5);
    assert.strictEqual(routes[2][2], checkoutRateLimit);
    assert.deepStrictEqual(routes[2][3], { kind: 'json', options: { limit: '8kb' } });
    assert.strictEqual(routes[2][4], wrappedCheckout);

    // Portal keeps rate limit, JSON parser, and wrapped handler in order.
    assert.strictEqual(routes[3].length, 5);
    assert.strictEqual(routes[3][2], portalRateLimit);
    assert.deepStrictEqual(routes[3][3], { kind: 'json', options: { limit: '8kb' } });
    assert.strictEqual(routes[3][4], wrappedPortal);
  });

  it('wraps checkout and portal handlers with their error fallback args', () => {
    const routes = [];
    const wrapperCalls = [];
    const handleCheckout = () => {};
    const handleBillingPortal = () => {};

    registerBillingRoutes({
      app: createApp(routes),
      express: createExpress(),
      webhookRateLimit: 'webhook-limit',
      checkoutRateLimit: 'checkout-limit',
      portalRateLimit: 'portal-limit',
      handleBillingConfig: () => {},
      handleBillingWebhook: () => {},
      handleCheckout,
      handleBillingPortal,
      wrapBillingJsonRoute: (args) => {
        wrapperCalls.push(args);
        return args.handler;
      },
    });

    assert.deepStrictEqual(wrapperCalls.length, 2);
    assert.strictEqual(wrapperCalls[0].handler, handleCheckout);
    assert.deepStrictEqual(wrapperCalls[0].fallbackMessage, 'Unable to create checkout session.');
    assert.deepStrictEqual(wrapperCalls[0].failureCode, 'billing_checkout_failed');
    assert.strictEqual(wrapperCalls[1].handler, handleBillingPortal);
    assert.deepStrictEqual(wrapperCalls[1].fallbackMessage, 'Unable to open the billing portal.');
    assert.deepStrictEqual(wrapperCalls[1].failureCode, 'billing_portal_failed');
  });

  it('forwards adapter dependencies from the billing.js compatibility wrapper', () => {
    const Module = require('node:module');
    const billingRoutesPath = require.resolve('./billingRoutes');
    const billingPath = require.resolve('./billing');
    const firebaseAdminPath = require.resolve('./firebase-admin');
    const metricsPath = require.resolve('./metrics');
    const accountLifecyclePath = require.resolve('./account-lifecycle');
    const originalAdapter = require.cache[billingRoutesPath];
    const originalBilling = require.cache[billingPath];
    const originalFirebaseAdmin = require.cache[firebaseAdminPath];
    const originalMetrics = require.cache[metricsPath];
    const originalAccountLifecycle = require.cache[accountLifecyclePath];
    const originalLoad = Module._load;
    let forwarded = null;

    // Server dependencies are not installed for this focused adapter test, so
    // stub the external and Firebase-backed modules before loading billing.js.
    Module._load = function stubbedLoad(request, parent, isMain) {
      if (request === 'stripe') return function FakeStripe() {};
      if (request === 'express-rate-limit') return () => function billingRateLimit() {};
      return originalLoad.call(this, request, parent, isMain);
    };
    require.cache[firebaseAdminPath] = {
      id: firebaseAdminPath,
      filename: firebaseAdminPath,
      loaded: true,
      exports: { getAdminAuth: () => null, getAdminDb: () => null, hasFirebaseAdminConfig: () => false },
    };
    require.cache[metricsPath] = {
      id: metricsPath,
      filename: metricsPath,
      loaded: true,
      exports: { recordBillingMetricEvent: async () => true },
    };
    require.cache[accountLifecyclePath] = {
      id: accountLifecyclePath,
      filename: accountLifecyclePath,
      loaded: true,
      exports: {
        deleteStripeCustomer: async () => true,
        isAccountDeletionBlocked: async () => false,
        isStripeCustomerDeletionBlocked: async () => false,
      },
    };
    require.cache[billingRoutesPath] = {
      id: billingRoutesPath,
      filename: billingRoutesPath,
      loaded: true,
      exports: {
        registerBillingRoutes: (args) => {
          forwarded = args;
        },
      },
    };
    delete require.cache[billingPath];

    try {
      const billing = require('./billing');
      const app = { get: () => {}, post: () => {} };
      const express = { raw: () => ({}), json: () => ({}) };

      billing.registerBillingRoutes(app, express);

      assert.deepStrictEqual(Object.keys(forwarded).sort(), [
        'app',
        'checkoutRateLimit',
        'express',
        'handleBillingConfig',
        'handleBillingPortal',
        'handleBillingWebhook',
        'handleCheckout',
        'portalRateLimit',
        'webhookRateLimit',
        'wrapBillingJsonRoute',
      ]);
      assert.strictEqual(forwarded.app, app);
      assert.strictEqual(forwarded.express, express);
      assert.strictEqual(forwarded.wrapBillingJsonRoute, billing.wrapBillingJsonRoute);
      assert.strictEqual(typeof forwarded.handleBillingConfig, 'function');
      assert.strictEqual(typeof forwarded.handleBillingWebhook, 'function');
      assert.strictEqual(typeof forwarded.handleCheckout, 'function');
      assert.strictEqual(typeof forwarded.handleBillingPortal, 'function');

      // Rate limits are stable module singletons, with distinct checkout and portal caps.
      const first = { ...forwarded };
      billing.registerBillingRoutes({ get: () => {}, post: () => {} }, express);
      assert.strictEqual(forwarded.webhookRateLimit, first.webhookRateLimit);
      assert.strictEqual(forwarded.checkoutRateLimit, first.checkoutRateLimit);
      assert.strictEqual(forwarded.portalRateLimit, first.portalRateLimit);
      assert.notStrictEqual(forwarded.checkoutRateLimit, forwarded.portalRateLimit);
    } finally {
      Module._load = originalLoad;
      if (originalAdapter) require.cache[billingRoutesPath] = originalAdapter;
      else delete require.cache[billingRoutesPath];
      if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
      else delete require.cache[firebaseAdminPath];
      if (originalMetrics) require.cache[metricsPath] = originalMetrics;
      else delete require.cache[metricsPath];
      if (originalAccountLifecycle) require.cache[accountLifecyclePath] = originalAccountLifecycle;
      else delete require.cache[accountLifecyclePath];
      if (originalBilling) require.cache[billingPath] = originalBilling;
      else delete require.cache[billingPath];
      delete require.cache[billingPath];
    }
  });
});
