'use strict';

const REQUIRED_ROUTE_DEPENDENCIES = [
  'app',
  'express',
  'webhookRateLimit',
  'checkoutRateLimit',
  'portalRateLimit',
  'handleBillingConfig',
  'handleBillingWebhook',
  'handleCheckout',
  'handleBillingPortal',
  'wrapBillingJsonRoute',
];

/** Registers the hosted billing endpoints against the supplied Express app. */
const registerBillingRoutes = (dependencies) => {
  const missing = REQUIRED_ROUTE_DEPENDENCIES.filter(
    (name) => dependencies?.[name] == null,
  );
  if (missing.length > 0) {
    throw new Error(
      `registerBillingRoutes missing dependencies: ${missing.join(', ')}`,
    );
  }

  const {
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
  } = dependencies;

  app.get('/api/billing/config', handleBillingConfig);
  app.post(
    '/api/billing/webhook',
    webhookRateLimit,
    express.raw({ type: 'application/json' }),
    handleBillingWebhook,
  );
  app.post(
    '/api/billing/checkout',
    checkoutRateLimit,
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute({
      handler: handleCheckout,
      fallbackMessage: 'Unable to create checkout session.',
      failureCode: 'billing_checkout_failed',
    }),
  );
  app.post(
    '/api/billing/portal',
    portalRateLimit,
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute({
      handler: handleBillingPortal,
      fallbackMessage: 'Unable to open the billing portal.',
      failureCode: 'billing_portal_failed',
    }),
  );
};

module.exports = { registerBillingRoutes };
