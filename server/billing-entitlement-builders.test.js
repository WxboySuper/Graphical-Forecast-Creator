const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createCheckoutEntitlementWrite,
  createSubscriptionEntitlementPayload,
  createSubscriptionEntitlementWrite,
  getCheckoutRefundTarget,
  getPlanInterval,
  getSubscriptionUid,
} = require('./billing-entitlement-builders');

test('builds checkout entitlement writes from session metadata', () => {
  assert.deepEqual(
    createCheckoutEntitlementWrite({
        metadata: { uid: 'user-1', plan: 'annual' },
        customer: 'cus_123',
        subscription: 'sub_123',
    }), {
      uid: 'user-1',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      payload: {
        uid: 'user-1',
        planInterval: 'annual',
        billingStatus: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
  });
});

test('builds subscription entitlement writes from Stripe lifecycle data', () => {
  const result = createSubscriptionEntitlementWrite({
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: 1_700_000_000,
      items: { data: [{ price: { recurring: { interval: 'year' } } }] },
      metadata: { uid: 'user-1' },
  });

  assert.equal(result.uid, 'user-1');
  assert.equal(result.stripeCustomerId, 'cus_123');
  assert.deepEqual({
      planInterval: result.payload.planInterval,
      billingStatus: result.payload.billingStatus,
      stripeSubscriptionId: result.payload.stripeSubscriptionId,
      cancelAtPeriodEnd: result.payload.cancelAtPeriodEnd,
    }, {
      planInterval: 'annual',
      billingStatus: 'active',
      stripeSubscriptionId: 'sub_123',
      cancelAtPeriodEnd: true,
    });
  assert.deepEqual(result.payload.currentPeriodEnd, new Date(1_700_000_000 * 1000));
});

test('prefers payment intents when locating a refund target', () => {
  assert.deepEqual(
    getCheckoutRefundTarget(
        { payment_intent: { id: 'pi_session' } },
        { latest_invoice: { charge: { id: 'ch_invoice' }, payments: { data: [] } } }
    ), { payment_intent: 'pi_session' });
});

test('falls back to a charge when no payment intent exists', () => {
  assert.deepEqual(
    getCheckoutRefundTarget(
        {},
        { latest_invoice: { payments: { data: [{ payment: { charge: 'ch_123' } }] } } }
    ), { charge: 'ch_123' });
});

test('returns null when no refundable payment exists', () => {
  assert.equal(getCheckoutRefundTarget({}, {}), null);
  assert.equal(
    getCheckoutRefundTarget({}, { latest_invoice: { payments: { data: [] } } }),
    null
  );
});

test('maps plan intervals and subscription UIDs', () => {
  assert.equal(getPlanInterval('year'), 'annual');
  assert.equal(getPlanInterval('month'), 'monthly');
  assert.equal(getPlanInterval(undefined), 'monthly');
  assert.equal(getSubscriptionUid({ metadata: { uid: 'user-1' } }), 'user-1');
  assert.equal(getSubscriptionUid({}), '');
});

test('normalizes expanded Stripe objects to null in checkout writes', () => {
  const result = createCheckoutEntitlementWrite({
    metadata: { uid: 'user-1', plan: 'monthly' },
    customer: { id: 'cus_expanded' },
    subscription: { id: 'sub_expanded' },
  });

  assert.equal(result.stripeCustomerId, null);
  assert.equal(result.stripeSubscriptionId, null);
  assert.equal(result.payload.planInterval, 'monthly');
});

test('defaults subscription payloads when Stripe fields are missing', () => {
  const payload = createSubscriptionEntitlementPayload({ id: 'sub_123' }, '', null);

  assert.deepEqual(
    {
      planInterval: payload.planInterval,
      billingStatus: payload.billingStatus,
      stripeSubscriptionId: payload.stripeSubscriptionId,
      cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
      currentPeriodEnd: payload.currentPeriodEnd,
    },
    {
      planInterval: 'monthly',
      billingStatus: 'inactive',
      stripeSubscriptionId: 'sub_123',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    }
  );
});
