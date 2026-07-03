'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { getBaseUrl, getBillingRuntimeConfig } = require('./billing-config');

describe('getBaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APP_BASE_URL;
  });

  it('returns APP_BASE_URL when set', () => {
    process.env.APP_BASE_URL = 'https://gfc.weatherboysuper.com';
    assert.equal(getBaseUrl(), 'https://gfc.weatherboysuper.com');
  });

  it('falls back to localhost when APP_BASE_URL is absent', () => {
    assert.equal(getBaseUrl(), 'http://127.0.0.1:3000');
  });

  it('does not accept request headers as a fallback', () => {
    assert.equal(getBaseUrl(), 'http://127.0.0.1:3000');
  });
});

describe('getBillingRuntimeConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_MONTHLY;
    delete process.env.STRIPE_PRICE_ANNUAL_STANDARD;
    delete process.env.STRIPE_PRICE_ANNUAL_PROMO;
    delete process.env.APP_BASE_URL;
    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  });

  it('checkoutEnabled is false when APP_BASE_URL is missing', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_ANNUAL_STANDARD = 'price_annual';
    process.env.FIREBASE_ADMIN_PROJECT_ID = 'project';
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = 'email@test.com';
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = 'key';

    const config = getBillingRuntimeConfig();
    assert.equal(config.billingEnabled, true);
    assert.equal(config.checkoutEnabled, false);
  });

  it('checkoutEnabled is true when all config including APP_BASE_URL is present', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_ANNUAL_STANDARD = 'price_annual';
    process.env.APP_BASE_URL = 'https://gfc.weatherboysuper.com';
    process.env.FIREBASE_ADMIN_PROJECT_ID = 'project';
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = 'email@test.com';
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = 'key';

    const config = getBillingRuntimeConfig();
    assert.equal(config.billingEnabled, true);
    assert.equal(config.checkoutEnabled, true);
  });
});
