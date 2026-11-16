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

const resolveBillingCompatPaths = () => ({
  billingRoutesPath: require.resolve('./billingRoutes'),
  billingPath: require.resolve('./billing'),
  firebaseAdminPath: require.resolve('./firebase-admin'),
  metricsPath: require.resolve('./metrics'),
  accountLifecyclePath: require.resolve('./account-lifecycle'),
});

const snapshotBillingCompatCache = (paths) => ({
  adapter: require.cache[paths.billingRoutesPath],
  billing: require.cache[paths.billingPath],
  firebaseAdmin: require.cache[paths.firebaseAdminPath],
  metrics: require.cache[paths.metricsPath],
  accountLifecycle: require.cache[paths.accountLifecyclePath],
});

const stubBillingCompatModules = (Module, paths, holder) => {
  const originalLoad = Module._load;
  // Server dependencies are not installed for this focused adapter test, so
  // stub the external and Firebase-backed modules before loading billing.js.
  Module._load = function stubbedLoad(request, parent, isMain) {
    if (request === 'stripe') return function FakeStripe() {};
    if (request === 'express-rate-limit') return () => function billingRateLimit() {};
    return originalLoad.call(this, request, parent, isMain);
  };
  require.cache[paths.firebaseAdminPath] = {
    id: paths.firebaseAdminPath,
    filename: paths.firebaseAdminPath,
    loaded: true,
    exports: { getAdminAuth: () => null, getAdminDb: () => null, hasFirebaseAdminConfig: () => false },
  };
  require.cache[paths.metricsPath] = {
    id: paths.metricsPath,
    filename: paths.metricsPath,
    loaded: true,
    exports: { recordBillingMetricEvent: async () => true },
  };
  require.cache[paths.accountLifecyclePath] = {
    id: paths.accountLifecyclePath,
    filename: paths.accountLifecyclePath,
    loaded: true,
    exports: {
      deleteStripeCustomer: async () => true,
      isAccountDeletionBlocked: async () => false,
      isStripeCustomerDeletionBlocked: async () => false,
    },
  };
  require.cache[paths.billingRoutesPath] = {
    id: paths.billingRoutesPath,
    filename: paths.billingRoutesPath,
    loaded: true,
    exports: {
      registerBillingRoutes: (args) => {
        holder.forwarded = args;
      },
    },
  };
  delete require.cache[paths.billingPath];
  return originalLoad;
};

const restoreBillingCompatModules = (Module, paths, snapshot, originalLoad) => {
  Module._load = originalLoad;
  if (snapshot.adapter) require.cache[paths.billingRoutesPath] = snapshot.adapter;
  else delete require.cache[paths.billingRoutesPath];
  if (snapshot.firebaseAdmin) require.cache[paths.firebaseAdminPath] = snapshot.firebaseAdmin;
  else delete require.cache[paths.firebaseAdminPath];
  if (snapshot.metrics) require.cache[paths.metricsPath] = snapshot.metrics;
  else delete require.cache[paths.metricsPath];
  if (snapshot.accountLifecycle) require.cache[paths.accountLifecyclePath] = snapshot.accountLifecycle;
  else delete require.cache[paths.accountLifecyclePath];
  if (snapshot.billing) require.cache[paths.billingPath] = snapshot.billing;
  else delete require.cache[paths.billingPath];
};

const assertForwardedAdapterArgs = (forwarded, app, express, billing) => {
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
};

const assertStableBillingRateLimits = (billing, holder, express) => {
  // Rate limits are stable module singletons, with distinct checkout and portal caps.
  const first = { ...holder.forwarded };
  billing.registerBillingRoutes({ get: () => {}, post: () => {} }, express);
  assert.strictEqual(holder.forwarded.webhookRateLimit, first.webhookRateLimit);
  assert.strictEqual(holder.forwarded.checkoutRateLimit, first.checkoutRateLimit);
  assert.strictEqual(holder.forwarded.portalRateLimit, first.portalRateLimit);
  assert.notStrictEqual(holder.forwarded.checkoutRateLimit, holder.forwarded.portalRateLimit);
};

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
    const paths = resolveBillingCompatPaths();
    const snapshot = snapshotBillingCompatCache(paths);
    const holder = { forwarded: null };
    const originalLoad = stubBillingCompatModules(Module, paths, holder);

    try {
      const billing = require('./billing');
      const app = { get: () => {}, post: () => {} };
      const express = { raw: () => ({}), json: () => ({}) };

      billing.registerBillingRoutes(app, express);

      assertForwardedAdapterArgs(holder.forwarded, app, express, billing);
      assertStableBillingRateLimits(billing, holder, express);
    } finally {
      restoreBillingCompatModules(Module, paths, snapshot, originalLoad);
    }
  });
});
