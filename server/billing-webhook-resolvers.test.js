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
  assert.equal(getInvoiceSubscription({ subscription: 'sub_1' }), 'sub_1');
  assert.deepEqual(getWebhookSubscription({ type: 'customer.subscription.updated', data: { object: subscription } }), subscription);
  assert.equal(getWebhookSubscription({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_1' } } }), 'sub_1');
  assert.equal(getWebhookSubscription({ type: 'invoice.paid', data: { object: { subscription: 'sub_1' } } }), 'sub_1');
  assert.deepEqual(await resolveAuthoritativeSubscription({}, { type: 'customer.subscription.updated', data: { object: subscription } }), subscription);
});

test('resolves parent subscription details invoice shape', () => {
  assert.equal(
    getInvoiceSubscription({ parent: { subscription_details: { subscription: 'sub_parent' } } }),
    'sub_parent',
  );
  assert.equal(
    getWebhookSubscription({
      type: 'invoice.paid',
      data: { object: { parent: { subscription_details: { subscription: 'sub_parent' } } } },
    }),
    'sub_parent',
  );
  assert.equal(getInvoiceSubscription({}), null);
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
  assert.deepEqual(result, stored);
  assert.equal(retrievedId, 'sub_1');
});

test('returns null for missing or unsupported webhook subscriptions', async () => {
  assert.equal(getWebhookSubscription({ type: 'checkout.session.completed', data: { object: {} } }), null);
  assert.equal(getWebhookSubscription({ type: 'invoice.paid', data: { object: {} } }), null);
  assert.equal(getWebhookSubscription({ type: 'payment_intent.succeeded', data: { object: {} } }), null);
  assert.equal(
    await resolveAuthoritativeSubscription({}, { type: 'invoice.paid', data: { object: {} } }),
    null,
  );
  assert.equal(
    await resolveAuthoritativeSubscription(
      {},
      { type: 'checkout.session.completed', data: { object: {} } },
    ),
    null,
  );
});

test('preserves fallback checkout metadata and invoice UIDs', () => {
  assert.deepEqual(withFallbackSubscriptionUid({ id: 'sub_1' }, 'user-1'), {
    id: 'sub_1',
    metadata: { uid: 'user-1' },
  });
  assert.deepEqual(withFallbackSubscriptionUid({ id: 'sub_1', metadata: { uid: 'existing' } }, 'fallback'), {
    id: 'sub_1',
    metadata: { uid: 'existing' },
  });
  assert.equal(resolveInvoiceUid({ metadata: { uid: 'user-1' } }, {}), 'user-1');
  assert.equal(resolveInvoiceUid({}, { parent: { subscription_details: { metadata: { uid: 'user-2' } } } }), 'user-2');
});

test('leaves subscriptions untouched when fallback UID is falsy', () => {
  assert.deepEqual(withFallbackSubscriptionUid({ id: 'sub_1' }, undefined), {
    id: 'sub_1',
    metadata: {},
  });
  assert.deepEqual(withFallbackSubscriptionUid({ id: 'sub_1' }, ''), {
    id: 'sub_1',
    metadata: {},
  });
  assert.deepEqual(withFallbackSubscriptionUid({ id: 'sub_1', metadata: {} }, null), {
    id: 'sub_1',
    metadata: {},
  });
});

test('prefers subscription and parent metadata when resolving invoice UIDs', () => {
  assert.equal(
    resolveInvoiceUid(
      { metadata: { uid: 'user-1' } },
      {
        parent: { subscription_details: { metadata: { uid: 'user-parent' } } },
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
    ),
    'user-1',
  );
  assert.equal(
    resolveInvoiceUid(
      {},
      {
        parent: { subscription_details: { metadata: { uid: 'user-parent' } } },
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
    ),
    'user-parent',
  );
  assert.equal(
    resolveInvoiceUid({}, { subscription_details: { metadata: { uid: 'user-legacy' } } }),
    'user-legacy',
  );
  assert.equal(resolveInvoiceUid({}, {}), '');
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
  assert.deepEqual(await buildCheckoutEntitlementWrite({}, fallbackEvent, session), {
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
  assert.equal(subscriptionWrite.uid, 'user-1');
  assert.equal(subscriptionWrite.payload.uid, 'user-1');
  assert.equal(subscriptionWrite.stripeSubscriptionId, 'sub_1');
});
