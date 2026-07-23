'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canWriteEntitlementForUid,
  cleanupBlockedCheckoutSession,
  getCheckoutRefundTarget,
} = require('./billing');

/** Builds a mock Stripe client that records every call into `calls`. */
const createTrackingStripe = (overrides = {}) => {
  const calls = [];
  const stripe = {
    subscriptions: {
      retrieve: overrides.retrieve ?? (async () => assert.fail('should not retrieve')),
    },
    refunds: {
      create: async (target, options) => calls.push(['refund', target, options]),
    },
    customers: {
      del: async (id) => calls.push(['delete', id]),
    },
    ...overrides.extra,
  };
  return { calls, stripe };
};

test('billing writes remain allowed for an existing Firebase identity', async () => {
  const adminAuth = { getUser: async (uid) => ({ uid }) };
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
  assert.equal(await canWriteEntitlementForUid('user-1', { adminAuth, db }), true);
});

test('late billing writes are blocked after Firebase identity deletion', async () => {
  const adminAuth = {
    getUser: async () => {
      const error = new Error('missing');
      error.code = 'auth/user-not-found';
      throw error;
    },
  };
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
  assert.equal(await canWriteEntitlementForUid('user-1', { adminAuth, db }), false);
});

test('billing auth lookup failures are not mistaken for deletion', async () => {
  const adminAuth = { getUser: async () => { throw new Error('network'); } };
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
  await assert.rejects(canWriteEntitlementForUid('user-1', { adminAuth, db }), /network/);
});

test('billing writes are blocked by an in-progress deletion marker', async () => {
  const adminAuth = { getUser: async (uid) => ({ uid }) };
  const db = {
    collection: (name) => ({
      doc: () => ({ get: async () => ({ exists: name === 'accountDeletionRequests' }) }),
    }),
  };
  assert.equal(await canWriteEntitlementForUid('user-1', { adminAuth, db }), false);
});

test('late Checkout cleanup finds payment intents in the current invoice payments shape', () => {
  const target = getCheckoutRefundTarget(
    { payment_intent: null },
    {
      latest_invoice: {
        payments: {
          data: [{ payment: { payment_intent: { id: 'pi_current' } } }],
        },
      },
    }
  );
  assert.deepEqual(target, { payment_intent: 'pi_current' });
});

test('late Checkout cleanup refunds idempotently before deleting the customer', async () => {
  const { calls, stripe } = createTrackingStripe({
    retrieve: async (id, options) => {
      calls.push(['retrieve', id, options]);
      return { latest_invoice: { payment_intent: { id: 'pi_late' } } };
    },
  });

  const cleaned = await cleanupBlockedCheckoutSession(
    {
      id: 'cs_late',
      client_reference_id: 'deleted-user',
      customer: 'cus_late',
      subscription: 'sub_late',
      payment_status: 'paid',
    },
    { stripe, canWrite: async () => false }
  );

  assert.equal(cleaned, true);
  assert.deepEqual(calls, [
    ['retrieve', 'sub_late', { expand: ['latest_invoice'] }],
    ['refund', { payment_intent: 'pi_late' }, { idempotencyKey: 'account-deletion-checkout-refund:cs_late' }],
    ['delete', 'cus_late'],
  ]);
});

test('late Checkout still refunds when account deletion already removed the subscription', async () => {
  const { calls, stripe } = createTrackingStripe({
    retrieve: async () => {
      const error = new Error('No such subscription');
      error.code = 'resource_missing';
      throw error;
    },
  });

  const cleaned = await cleanupBlockedCheckoutSession(
    {
      id: 'cs_race',
      client_reference_id: 'deleted-user',
      customer: 'cus_race',
      subscription: 'sub_race',
      payment_intent: 'pi_race',
      payment_status: 'paid',
    },
    { stripe, canWrite: async () => false }
  );

  assert.equal(cleaned, true);
  assert.deepEqual(calls, [
    ['refund', { payment_intent: 'pi_race' }, { idempotencyKey: 'account-deletion-checkout-refund:cs_race' }],
    ['delete', 'cus_race'],
  ]);
});

test('late Checkout cleanup resolves the payment through the current Invoice Payments API', async () => {
  const { calls, stripe } = createTrackingStripe({
    retrieve: async () => ({ latest_invoice: { id: 'in_current' } }),
    extra: {
      invoicePayments: {
        list: async (params) => {
          calls.push(['list', params]);
          return { data: [{ payment: { payment_intent: 'pi_current' } }] };
        },
      },
    },
  });

  await cleanupBlockedCheckoutSession(
    {
      id: 'cs_current',
      metadata: { uid: 'deleted-user' },
      customer: { id: 'cus_current' },
      subscription: { id: 'sub_current' },
      payment_status: 'paid',
    },
    { stripe, canWrite: async () => false }
  );

  assert.deepEqual(calls, [
    ['list', { invoice: 'in_current', limit: 10 }],
    [
      'refund',
      { payment_intent: 'pi_current' },
      { idempotencyKey: 'account-deletion-checkout-refund:cs_current' },
    ],
    ['delete', 'cus_current'],
  ]);
});

test('ordinary Checkout completion does not run late-deletion cleanup', async () => {
  const { stripe } = createTrackingStripe();
  const cleaned = await cleanupBlockedCheckoutSession(
    { id: 'cs_ok', client_reference_id: 'active-user' },
    { stripe, canWrite: async () => true }
  );
  assert.equal(cleaned, false);
});
