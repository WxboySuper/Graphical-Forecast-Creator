'use strict';

/**
 * Stripe API 2025-03-31+ exposes billing period end on subscription items, not the subscription root.
 * @param {import('stripe').Stripe.Subscription} subscription
 * @returns {number | null}
 */
const getSubscriptionPeriodEndUnix = (subscription) => {
  const itemEnd = subscription?.items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === 'number') {
    return itemEnd;
  }

  if (typeof subscription?.current_period_end === 'number') {
    return subscription.current_period_end;
  }

  return null;
};

module.exports = {
  getSubscriptionPeriodEndUnix,
};
