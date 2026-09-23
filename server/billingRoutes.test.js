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

const snapshotBillingCompatCache = () => ({ ...require.cache });

const stubBillingCompatModules = (Module, paths, holder) => {
  const originalLoad = Module._load;
  // Server dependencies are not installed for this focused adapter test, so
  // stub the external and Firebase-backed modules before loading billing.js.
  Module._load = function stubbedLoad(request, parent, isMain) {
    if (request === 'stripe') return function FakeStripe() {};
    if (request === 'express-rate-limit') {
      return (options) => {
        const middleware = function billingRateLimit() {};
        holder.rateLimitOptionsByMiddleware.set(middleware, options);
        return middleware;
      };
    }
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

const restoreBillingCompatCache = (Module, snapshot, originalLoad) => {
  Module._load = originalLoad;
  for (const key of Object.keys(require.cache)) delete require.cache[key];
  Object.assign(require.cache, snapshot);
};

const requireBillingCompatWithStubs = () => {
  const Module = require('node:module');
  const paths = resolveBillingCompatPaths();
  const snapshot = snapshotBillingCompatCache();
  const holder = { forwarded: null, rateLimitOptionsByMiddleware: new Map() };
  const originalLoad = stubBillingCompatModules(Module, paths, holder);
  try {
    return { billing: require('./billing'), holder };
  } finally {
    restoreBillingCompatCache(Module, snapshot, originalLoad);
  }
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
  assert.strictEqual(forwarded.handleBillingConfig.name, 'handleBillingConfig');
  assert.strictEqual(forwarded.handleBillingWebhook.name, 'handleBillingWebhook');
  assert.strictEqual(forwarded.handleCheckout.name, 'handleCheckout');
  assert.strictEqual(forwarded.handleBillingPortal.name, 'handleBillingPortal');
};

const assertBillingRateLimitMaxCaps = (forwarded, holder) => {
  const maxFor = (middleware) => holder.rateLimitOptionsByMiddleware.get(middleware)?.max;
  assert.strictEqual(maxFor(forwarded.checkoutRateLimit), 5);
  assert.strictEqual(maxFor(forwarded.portalRateLimit), 10);
  assert.strictEqual(maxFor(forwarded.webhookRateLimit), 100);
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
    const { billing, holder } = requireBillingCompatWithStubs();
    const app = { get: () => {}, post: () => {} };
    const express = { raw: () => ({}), json: () => ({}) };

    billing.registerBillingRoutes(app, express);

    assertForwardedAdapterArgs(holder.forwarded, app, express, billing);
    assertBillingRateLimitMaxCaps(holder.forwarded, holder);
    assertStableBillingRateLimits(billing, holder, express);
  });

  it('restores every require.cache entry after loading billing.js through the compatibility wrapper', () => {
    const before = { ...require.cache };
    const Module = require('node:module');
    const originalLoad = Module._load;
    requireBillingCompatWithStubs();
    assert.deepStrictEqual(Object.keys(require.cache).sort(), Object.keys(before).sort());
    for (const [filename, cachedModule] of Object.entries(before)) {
      assert.strictEqual(require.cache[filename], cachedModule, `${filename} cache entry changed`);
    }
    assert.strictEqual(Module._load, originalLoad);
  });

  it('throws a named error before registering routes when dependencies are missing', () => {
    assert.throws(
      () => registerBillingRoutes(),
      new Error(
        'registerBillingRoutes missing dependencies: app, express, webhookRateLimit, checkoutRateLimit, portalRateLimit, handleBillingConfig, handleBillingWebhook, handleCheckout, handleBillingPortal, wrapBillingJsonRoute',
      ),
    );

    const routes = [];
    assert.throws(
      () =>
        registerBillingRoutes({
          app: createApp(routes),
          express: createExpress(),
          webhookRateLimit: 'webhook-limit',
          checkoutRateLimit: 'checkout-limit',
          portalRateLimit: 'portal-limit',
          handleBillingConfig: () => {},
          handleBillingWebhook: () => {},
          handleCheckout: () => {},
          handleBillingPortal: () => {},
        }),
      new Error(
        'registerBillingRoutes missing dependencies: wrapBillingJsonRoute',
      ),
    );
    assert.deepStrictEqual(routes, []);
  });
});
