'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { getBaseUrl, getBillingReturnBaseUrl, getBillingRuntimeConfig } = require('./billing-config');

const originalEnv = process.env;

function resetEnv(keys) {
  process.env = { ...originalEnv };
  for (const key of keys) delete process.env[key];
}

describe('getBaseUrl', () => {
  beforeEach(() => resetEnv(['APP_BASE_URL']));

  it('returns APP_BASE_URL when set', () => {
    process.env.APP_BASE_URL = 'https://gfc.weatherboysuper.com';
    assert.equal(getBaseUrl(), 'https://gfc.weatherboysuper.com');
  });

  it('falls back to localhost when APP_BASE_URL is absent', () => {
    assert.equal(getBaseUrl(), 'http://127.0.0.1:3000');
  });

  it('never derives the base URL from request headers because getBaseUrl is env-only', () => {
    assert.equal(getBaseUrl.length, 0);
    assert.equal(getBaseUrl(), 'http://127.0.0.1:3000');
  });
});

describe('getBillingReturnBaseUrl', () => {
  beforeEach(() => resetEnv(['APP_BASE_URL', 'SERVER_TARGET', 'SENTRY_ENVIRONMENT']));

  it('uses the Cloudflare beta origin when SERVER_TARGET is beta', () => {
    process.env.SERVER_TARGET = 'beta';
    process.env.APP_BASE_URL = 'https://beta-gfc.weatherboysuper.com';
    const req = { headers: { origin: 'https://beta.gfcweather.com' } };
    assert.equal(getBillingReturnBaseUrl(req), 'https://beta.gfcweather.com');
  });

  it('uses APP_BASE_URL when Origin matches the configured legacy beta host', () => {
    process.env.SERVER_TARGET = 'beta';
    process.env.APP_BASE_URL = 'https://beta-gfc.weatherboysuper.com';
    const req = { headers: { origin: 'https://beta-gfc.weatherboysuper.com' } };
    assert.equal(getBillingReturnBaseUrl(req), 'https://beta-gfc.weatherboysuper.com');
  });

  it('falls back to APP_BASE_URL when Origin is missing or not allowed', () => {
    process.env.SERVER_TARGET = 'beta';
    process.env.APP_BASE_URL = 'https://beta-gfc.weatherboysuper.com';
    assert.equal(getBillingReturnBaseUrl({ headers: {} }), 'https://beta-gfc.weatherboysuper.com');
    assert.equal(
      getBillingReturnBaseUrl({ headers: { origin: 'https://evil.example' } }),
      'https://beta-gfc.weatherboysuper.com'
    );
  });
});

describe('getBillingRuntimeConfig', () => {
  beforeEach(() => resetEnv([
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_MONTHLY',
    'STRIPE_PRICE_ANNUAL_STANDARD',
    'STRIPE_PRICE_ANNUAL_PROMO',
    'APP_BASE_URL',
    'FIREBASE_ADMIN_PROJECT_ID',
    'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY',
  ]));

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
