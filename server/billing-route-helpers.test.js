/**
 * server test contract for billing-route-helpers.test.
 *
 * This file verifies the billing-route-helpers.test boundary, including its supported inputs, outputs, and failure behavior.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createCheckoutMetadata,
  getCheckoutCustomerEmail,
  getCheckoutPriceId,
  isCheckoutAvailable,
  isPortalAvailable,
} = require('./billingRouteHelpers');

test('resolves billing route availability and selected prices', () => {
  const config = { checkoutEnabled: true, hasBaseUrl: true, monthlyPriceId: 'price_monthly', annualPriceId: 'price_annual' };
  assert.equal(isCheckoutAvailable({}, config), true);
  assert.equal(isPortalAvailable({}, config), true);
  assert.equal(getCheckoutPriceId('monthly', config), 'price_monthly');
  assert.equal(getCheckoutPriceId('annual', config), 'price_annual');
  assert.equal(getCheckoutPriceId('invalid', config), '');
});

test('builds checkout metadata and filters unusable customer emails', () => {
  assert.deepEqual(createCheckoutMetadata('user-1', 'monthly'), { uid: 'user-1', plan: 'monthly' });
  assert.equal(getCheckoutCustomerEmail({ email: 'user@example.com' }), 'user@example.com');
  assert.equal(getCheckoutCustomerEmail({ email: '   ' }), undefined);
  assert.equal(getCheckoutCustomerEmail({}), undefined);
});