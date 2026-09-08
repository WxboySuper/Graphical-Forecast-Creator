/**
 * server test contract for billing-entitlement-builders.test.
 *
 * This file verifies the billing-entitlement-builders.test boundary, including its supported inputs, outputs, and failure behavior.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createCheckoutEntitlementWrite,
  createSubscriptionEntitlementWrite,
  getCheckoutRefundTarget,
} = require('./billingEntitlementBuilders');

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