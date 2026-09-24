const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  buildCheckoutEntitlementWrite,
  getInvoiceSubscription,
  getWebhookSubscription,
  resolveAuthoritativeSubscription,
  resolveInvoiceUid,
  withFallbackSubscriptionUid,
} = require('./billingWebhookResolvers');

test('resolves supported webhook subscription shapes', async () => {
  const subscription = { id: 'sub_1', metadata: { uid: 'user-1' } };
  assert.strictEqual(getInvoiceSubscription({ subscription: 'sub_1' }), 'sub_1');
  assert.deepStrictEqual(getWebhookSubscription({ type: 'customer.subscription.updated', data: { object: subscription } }), subscription);
  assert.strictEqual(getWebhookSubscription({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_1' } } }), 'sub_1');
  assert.strictEqual(getWebhookSubscription({ type: 'invoice.paid', data: { object: { subscription: 'sub_1' } } }), 'sub_1');
  assert.deepStrictEqual(await resolveAuthoritativeSubscription({}, { type: 'customer.subscription.updated', data: { object: subscription } }), subscription);
});

test('resolves parent subscription details invoice shape', () => {
  assert.strictEqual(
    getInvoiceSubscription({ parent: { subscription_details: { subscription: 'sub_parent' } } }),
    'sub_parent',
  );
  assert.strictEqual(
    getInvoiceSubscription({
      subscription: null,
      parent: { subscription_details: { subscription: 'sub_parent' } },
    }),
    'sub_parent',
  );
  assert.strictEqual(
    getWebhookSubscription({
      type: 'invoice.paid',
      data: { object: { parent: { subscription_details: { subscription: 'sub_parent' } } } },
    }),
    'sub_parent',
  );
  assert.strictEqual(getInvoiceSubscription({}), null);
});

test('retrieves string-ID subscriptions from Stripe', async () => {
  const stored = { id: 'sub_1', metadata: { uid: 'user-1' } };
  let retrievedId = null;
  const stripe = {
    subscriptions: {
      retrieve: async (id) => {
        retrievedId = id;
        return stored;
      },
    },
  };
  const result = await resolveAuthoritativeSubscription(
    stripe,
    { type: 'invoice.paid', data: { object: { subscription: 'sub_1' } } },
  );
  assert.deepStrictEqual(result, stored);
  assert.strictEqual(retrievedId, 'sub_1');
});

test('retrieves checkout string-ID subscriptions from Stripe', async () => {
  const stored = { id: 'sub_1', metadata: { uid: 'user-1' } };
  let retrievedId = null;
  const stripe = {
    subscriptions: {
      retrieve: async (id) => {
        retrievedId = id;
        return stored;
      },
    },
  };
  const result = await resolveAuthoritativeSubscription(
    stripe,
    { type: 'checkout.session.completed', data: { object: { subscription: 'sub_1' } } },
  );
  assert.deepStrictEqual(result, stored);
  assert.strictEqual(retrievedId, 'sub_1');
});

test('returns null for missing or unsupported webhook subscriptions', async () => {
  assert.strictEqual(getWebhookSubscription({ type: 'checkout.session.completed', data: { object: {} } }), null);
  assert.strictEqual(getWebhookSubscription({ type: 'invoice.paid', data: { object: {} } }), null);
  assert.strictEqual(getWebhookSubscription({ type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } }), 'sub_1');
  assert.strictEqual(getWebhookSubscription({ type: 'payment_intent.succeeded', data: { object: {} } }), null);
  assert.strictEqual(
    await resolveAuthoritativeSubscription({}, { type: 'invoice.paid', data: { object: {} } }),
    null,
  );
  assert.strictEqual(
    await resolveAuthoritativeSubscription(
      {},
      { type: 'checkout.session.completed', data: { object: {} } },
    ),
    null,
  );
});

test('preserves fallback checkout metadata and invoice UIDs', () => {
  assert.deepStrictEqual(withFallbackSubscriptionUid({ id: 'sub_1' }, 'user-1'), {
    id: 'sub_1',
    metadata: { uid: 'user-1' },
  });
  assert.deepStrictEqual(withFallbackSubscriptionUid({ id: 'sub_1', metadata: { uid: 'existing' } }, 'fallback'), {
    id: 'sub_1',
    metadata: { uid: 'existing' },
  });
  assert.deepStrictEqual(
    withFallbackSubscriptionUid({ id: 'sub_1', customer: 'cus_1', metadata: {} }, 'user-1'),
    { id: 'sub_1', customer: 'cus_1', metadata: { uid: 'user-1' } },
  );
  assert.deepStrictEqual(
    withFallbackSubscriptionUid({ id: 'sub_1', metadata: { plan: 'annual' } }, 'user-1'),
    { id: 'sub_1', metadata: { plan: 'annual', uid: 'user-1' } },
  );
  assert.strictEqual(resolveInvoiceUid({ metadata: { uid: 'user-1' } }, {}), 'user-1');
  assert.strictEqual(resolveInvoiceUid({}, { parent: { subscription_details: { metadata: { uid: 'user-2' } } } }), 'user-2');
});

test('leaves subscriptions untouched when fallback UID is falsy', () => {
  assert.deepStrictEqual(withFallbackSubscriptionUid({ id: 'sub_1' }, undefined), {
    id: 'sub_1',
    metadata: {},
  });
  assert.deepStrictEqual(withFallbackSubscriptionUid({ id: 'sub_1' }, ''), {
    id: 'sub_1',
    metadata: {},
  });
  assert.deepStrictEqual(withFallbackSubscriptionUid({ id: 'sub_1', metadata: {} }, null), {
    id: 'sub_1',
    metadata: {},
  });
});

test('prefers subscription and parent metadata when resolving invoice UIDs', () => {
  assert.strictEqual(
    resolveInvoiceUid(
      { metadata: { uid: 'user-1' } },
      {
        parent: { subscription_details: { metadata: { uid: 'user-parent' } } },
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
    ),
    'user-1',
  );
  assert.strictEqual(
    resolveInvoiceUid(
      {},
      {
        parent: { subscription_details: { metadata: { uid: 'user-parent' } } },
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
    ),
    'user-parent',
  );
  assert.strictEqual(
    resolveInvoiceUid(
      {},
      {
        parent: {},
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
    ),
    'user-legacy',
  );
  assert.strictEqual(
    resolveInvoiceUid({}, { subscription_details: { metadata: { uid: 'user-legacy' } } }),
    'user-legacy',
  );
  assert.strictEqual(resolveInvoiceUid({}, {}), '');
});

test('builds checkout entitlement writes from session or authoritative subscription', async () => {
  const session = {
    metadata: { uid: 'user-1', plan: 'annual' },
    customer: 'cus_1',
    subscription: 'sub_1',
  };
  const fallbackEvent = {
    type: 'checkout.session.completed',
    data: { object: { subscription: null } },
  };
  assert.deepStrictEqual(await buildCheckoutEntitlementWrite({}, fallbackEvent, session), {
    uid: 'user-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    payload: {
      uid: 'user-1',
      planInterval: 'annual',
      billingStatus: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
  });

  const subscriptionEvent = {
    type: 'checkout.session.completed',
    data: {
      object: {
        subscription: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: {} },
      },
    },
  };
  const subscriptionWrite = await buildCheckoutEntitlementWrite(
    {},
    subscriptionEvent,
    { metadata: { uid: 'user-1' } },
  );
  assert.strictEqual(subscriptionWrite.uid, 'user-1');
  assert.strictEqual(subscriptionWrite.payload.uid, 'user-1');
  assert.strictEqual(subscriptionWrite.stripeSubscriptionId, 'sub_1');
});

test('builds checkout entitlement writes from retrieved string-ID subscriptions', async () => {
  const stored = {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    metadata: {},
    cancel_at_period_end: false,
  };
  let retrievedId = null;
  const stripe = {
    subscriptions: {
      retrieve: async (id) => {
        retrievedId = id;
        return stored;
      },
    },
  };
  const event = {
    type: 'checkout.session.completed',
    data: { object: { subscription: 'sub_1' } },
  };
  const session = { metadata: { uid: 'user-1' }, customer: 'cus_1', subscription: 'sub_1' };

  assert.deepStrictEqual(await buildCheckoutEntitlementWrite(stripe, event, session), {
    uid: 'user-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    payload: {
      uid: 'user-1',
      planInterval: 'monthly',
      billingStatus: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
  });
  assert.strictEqual(retrievedId, 'sub_1');
});
