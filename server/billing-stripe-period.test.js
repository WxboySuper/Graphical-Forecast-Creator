'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getSubscriptionPeriodEndUnix } = require('./billing-stripe-period');

describe('getSubscriptionPeriodEndUnix', () => {
  it('reads period end from the first subscription item (Stripe API v2025-03-31+)', () => {
    const end = getSubscriptionPeriodEndUnix({
      items: { data: [{ current_period_end: 1_700_000_000 }] },
    });
    assert.equal(end, 1_700_000_000);
  });

  it('falls back to subscription-level period end for older webhook payloads', () => {
    const end = getSubscriptionPeriodEndUnix({
      current_period_end: 1_600_000_000,
      items: { data: [{}] },
    });
    assert.equal(end, 1_600_000_000);
  });

  it('returns null when no period end is present', () => {
    assert.equal(getSubscriptionPeriodEndUnix({ items: { data: [{}] } }), null);
  });
});
