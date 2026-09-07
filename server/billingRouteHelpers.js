'use strict';

/** Returns whether Checkout can create sessions in the current deployment. */
const isCheckoutAvailable = (stripe, billingConfig) => Boolean(stripe && billingConfig.checkoutEnabled);

/** Returns whether the customer portal has the required deployment settings. */
const isPortalAvailable = (stripe, billingConfig) => Boolean(stripe && billingConfig.hasBaseUrl);

/** Resolves the Stripe price identifier for the selected billing plan. */
const getCheckoutPriceId = (plan, billingConfig) => {
  if (plan === 'monthly') {
    return billingConfig.monthlyPriceId;
  }

  if (plan === 'annual') {
    return billingConfig.annualPriceId;
  }

  return '';
};

/** Builds metadata shared by the Checkout session and its subscription. */
const createCheckoutMetadata = (uid, plan) => ({ uid, plan });

/** Returns the decoded token email only when it contains a usable address. */
const getCheckoutCustomerEmail = (decodedToken) =>
  typeof decodedToken.email === 'string' && decodedToken.email.trim() ? decodedToken.email : undefined;

module.exports = {
  createCheckoutMetadata,
  getCheckoutCustomerEmail,
  getCheckoutPriceId,
  isCheckoutAvailable,
  isPortalAvailable,
};
