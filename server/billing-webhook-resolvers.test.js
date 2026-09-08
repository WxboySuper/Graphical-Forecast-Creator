/**
 * server test contract for billing-webhook-resolvers.test.
 *
 * This file verifies the billing-webhook-resolvers.test boundary, including its supported inputs, outputs, and failure behavior.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  getInvoiceSubscription,
  getWebhookSubscription,
  resolveAuthoritativeSubscription,
  resolveInvoiceUid,
  withFallbackSubscriptionUid,
} = require('./billingWebhookResolvers');

test('resolves supported webhook subscription shapes', async () => {
  const subscription = { id: 'sub_1', metadata: { uid: 'user-1' } };
  assert.equal(getInvoiceSubscription({ subscription: 'sub_1' }), 'sub_1');
  assert.equal(getWebhookSubscription({ type: 'customer.subscription.updated', data: { object: subscription } }), subscription);
  assert.equal(getWebhookSubscription({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_1' } } }), 'sub_1');
  assert.equal(getWebhookSubscription({ type: 'invoice.paid', data: { object: { subscription: 'sub_1' } } }), 'sub_1');
  assert.equal(await resolveAuthoritativeSubscription({}, { type: 'customer.subscription.updated', data: { object: subscription } }), subscription);
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