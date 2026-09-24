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

const webhookEvent = (type, object) => ({ type, data: { object } });

const createRetrieveStub = (stored) => {
  let retrievedId = null;
  const stripe = {
    subscriptions: {
      retrieve: async (id) => {
        retrievedId = id;
        return stored;
      },
    },
  };
  return { stripe, getRetrievedId: () => retrievedId };
};

const expectedCheckoutEntitlementWrite = ({ uid, customer, subscription, planInterval }) => ({
  uid,
  stripeCustomerId: customer,
  stripeSubscriptionId: subscription,
  payload: {
    uid,
    planInterval,
    billingStatus: 'active',
    stripeCustomerId: customer,
    stripeSubscriptionId: subscription,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  },
});

test('resolves supported webhook subscription shapes', async () => {
  const subscription = { id: 'sub_1', metadata: { uid: 'user-1' } };
  assert.strictEqual(getInvoiceSubscription({ subscription: 'sub_1' }), 'sub_1');
  assert.deepStrictEqual(
    getWebhookSubscription(webhookEvent('customer.subscription.updated', subscription)),
    subscription,
  );
  for (const eventType of ['checkout.session.completed', 'invoice.paid']) {
    assert.strictEqual(
      getWebhookSubscription(webhookEvent(eventType, { subscription: 'sub_1' })),
      'sub_1',
      eventType,
    );
  }
  assert.deepStrictEqual(
    await resolveAuthoritativeSubscription({}, webhookEvent('customer.subscription.updated', subscription)),
    subscription,
  );
});

test('resolves parent subscription details invoice shape', () => {
  const parentInvoice = { parent: { subscription_details: { subscription: 'sub_parent' } } };
  for (const invoice of [parentInvoice, { subscription: null, ...parentInvoice }]) {
    assert.strictEqual(getInvoiceSubscription(invoice), 'sub_parent');
  }
  assert.strictEqual(
    getWebhookSubscription(webhookEvent('invoice.paid', parentInvoice)),
    'sub_parent',
  );
  assert.strictEqual(getInvoiceSubscription({}), null);
});

test('retrieves string-ID subscriptions from Stripe', async () => {
  const stored = { id: 'sub_1', metadata: { uid: 'user-1' } };
  for (const eventType of ['invoice.paid', 'checkout.session.completed']) {
    const { stripe, getRetrievedId } = createRetrieveStub(stored);
    const result = await resolveAuthoritativeSubscription(
      stripe,
      webhookEvent(eventType, { subscription: 'sub_1' }),
    );
    assert.deepStrictEqual(result, stored, eventType);
    assert.strictEqual(getRetrievedId(), 'sub_1', eventType);
  }
});

test('returns null for missing or unsupported webhook subscriptions', async () => {
  for (const [eventType, object, expected] of [
    ['checkout.session.completed', {}, null],
    ['invoice.paid', {}, null],
    ['invoice.payment_failed', { subscription: 'sub_1' }, 'sub_1'],
    ['payment_intent.succeeded', {}, null],
  ]) {
    assert.strictEqual(getWebhookSubscription(webhookEvent(eventType, object)), expected, eventType);
  }
  for (const eventType of ['invoice.paid', 'checkout.session.completed']) {
    assert.strictEqual(
      await resolveAuthoritativeSubscription({}, webhookEvent(eventType, {})),
      null,
      eventType,
    );
  }
});

test('preserves fallback checkout metadata and invoice UIDs', () => {
  for (const [subscription, fallbackUid, expected] of [
    [{ id: 'sub_1' }, 'user-1', { id: 'sub_1', metadata: { uid: 'user-1' } }],
    [
      { id: 'sub_1', metadata: { uid: 'existing' } },
      'fallback',
      { id: 'sub_1', metadata: { uid: 'existing' } },
    ],
    [
      { id: 'sub_1', customer: 'cus_1', metadata: {} },
      'user-1',
      { id: 'sub_1', customer: 'cus_1', metadata: { uid: 'user-1' } },
    ],
    [
      { id: 'sub_1', metadata: { plan: 'annual' } },
      'user-1',
      { id: 'sub_1', metadata: { plan: 'annual', uid: 'user-1' } },
    ],
  ]) {
    assert.deepStrictEqual(withFallbackSubscriptionUid(subscription, fallbackUid), expected);
  }
  assert.strictEqual(resolveInvoiceUid({ metadata: { uid: 'user-1' } }, {}), 'user-1');
  assert.strictEqual(
    resolveInvoiceUid({}, { parent: { subscription_details: { metadata: { uid: 'user-2' } } } }),
    'user-2',
  );
});

test('leaves subscriptions untouched when fallback UID is falsy', () => {
  for (const [subscription, fallbackUid] of [
    [{ id: 'sub_1' }, undefined],
    [{ id: 'sub_1' }, ''],
    [{ id: 'sub_1', metadata: {} }, null],
  ]) {
    assert.deepStrictEqual(withFallbackSubscriptionUid(subscription, fallbackUid), {
      id: 'sub_1',
      metadata: {},
    });
  }
});

test('prefers subscription and parent metadata when resolving invoice UIDs', () => {
  for (const [subscription, invoice, expected] of [
    [
      { metadata: { uid: 'user-1' } },
      {
        parent: { subscription_details: { metadata: { uid: 'user-parent' } } },
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
      'user-1',
    ],
    [
      {},
      {
        parent: { subscription_details: { metadata: { uid: 'user-parent' } } },
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
      'user-parent',
    ],
    [
      {},
      {
        parent: {},
        subscription_details: { metadata: { uid: 'user-legacy' } },
      },
      'user-legacy',
    ],
    [{}, { subscription_details: { metadata: { uid: 'user-legacy' } } }, 'user-legacy'],
    [{}, {}, ''],
  ]) {
    assert.strictEqual(resolveInvoiceUid(subscription, invoice), expected);
  }
});

test('builds checkout entitlement writes from session or authoritative subscription', async () => {
  const session = {
    metadata: { uid: 'user-1', plan: 'annual' },
    customer: 'cus_1',
    subscription: 'sub_1',
  };
  const fallbackEvent = webhookEvent('checkout.session.completed', { subscription: null });
  assert.deepStrictEqual(
    await buildCheckoutEntitlementWrite({}, fallbackEvent, session),
    expectedCheckoutEntitlementWrite({
      uid: 'user-1',
      customer: 'cus_1',
      subscription: 'sub_1',
      planInterval: 'annual',
    }),
  );

  const subscriptionEvent = webhookEvent('checkout.session.completed', {
    subscription: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: {} },
  });
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
  const { stripe, getRetrievedId } = createRetrieveStub(stored);
  const event = webhookEvent('checkout.session.completed', { subscription: 'sub_1' });
  const session = { metadata: { uid: 'user-1' }, customer: 'cus_1', subscription: 'sub_1' };

  assert.deepStrictEqual(
    await buildCheckoutEntitlementWrite(stripe, event, session),
    expectedCheckoutEntitlementWrite({
      uid: 'user-1',
      customer: 'cus_1',
      subscription: 'sub_1',
      planInterval: 'monthly',
    }),
  );
  assert.strictEqual(getRetrievedId(), 'sub_1');
});
