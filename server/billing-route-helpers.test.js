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

test('reports checkout unavailable when Stripe or deployment config disables it', () => {
  const enabledConfig = { checkoutEnabled: true };
  const disabledConfig = { checkoutEnabled: false };

  assert.equal(isCheckoutAvailable(null, enabledConfig), false);
  assert.equal(isCheckoutAvailable(undefined, enabledConfig), false);
  assert.equal(isCheckoutAvailable({}, disabledConfig), false);
  assert.equal(isCheckoutAvailable({}, { checkoutEnabled: '' }), false);
});

test('reports portal unavailable when Stripe or base URL is missing', () => {
  const withBaseUrl = { hasBaseUrl: true };
  const withoutBaseUrl = { hasBaseUrl: false };

  assert.equal(isPortalAvailable(null, withBaseUrl), false);
  assert.equal(isPortalAvailable(undefined, withBaseUrl), false);
  assert.equal(isPortalAvailable({}, withoutBaseUrl), false);
  assert.equal(isPortalAvailable({}, { hasBaseUrl: '' }), false);
});

test('returns falsy prices for unknown plans and missing price configuration', () => {
  const config = { monthlyPriceId: 'price_monthly', annualPriceId: 'price_annual' };

  assert.equal(getCheckoutPriceId('invalid', config), '');
  assert.equal(getCheckoutPriceId(null, config), '');
  assert.equal(getCheckoutPriceId(undefined, config), '');
  // billing.js rejects any falsy priceId with a 400, so a config without price
  // IDs must also resolve falsy rather than a usable price.
  assert.ok(!getCheckoutPriceId('monthly', {}));
  assert.ok(!getCheckoutPriceId('annual', {}));
  assert.ok(!getCheckoutPriceId('monthly', { monthlyPriceId: '', annualPriceId: '' }));
});

test('ignores null and non-string customer emails', () => {
  assert.equal(getCheckoutCustomerEmail({ email: null }), undefined);
  assert.equal(getCheckoutCustomerEmail({ email: undefined }), undefined);
  assert.equal(getCheckoutCustomerEmail({ email: 123 }), undefined);
  assert.equal(getCheckoutCustomerEmail({ email: '' }), undefined);
});

test('requires caller-provided token and config objects', () => {
  // billing.js guarantees these preconditions: verifyRequestUser early-returns
  // on a missing token and getBillingRuntimeConfig always returns an object,
  // so null containers surface as TypeErrors rather than silent fallbacks.
  assert.throws(() => getCheckoutCustomerEmail(null), TypeError);
  assert.throws(() => getCheckoutCustomerEmail(undefined), TypeError);
  assert.throws(() => isCheckoutAvailable({}, null), TypeError);
  assert.throws(() => isPortalAvailable({}, undefined), TypeError);
});
