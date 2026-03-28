'use strict';

const { hasFirebaseAdminConfig } = require('./firebase-admin');

const MONTHLY_DISPLAY_PRICE = '$3/month';
const ANNUAL_PROMO_DISPLAY_PRICE = '$25/year';
const ANNUAL_STANDARD_DISPLAY_PRICE = '$30/year';

/** Parses an ISO date env var and returns null when the value is absent or invalid. */
const parseDateEnv = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Returns the public base URL used for Stripe return links. */
const getBaseUrl = (req) =>
  process.env.APP_BASE_URL ||
  req.headers.origin ||
  'http://127.0.0.1:3000';

/** True when the annual intro pricing window is currently active. */
const isAnnualPromoActive = () => {
  const now = new Date();
  const promoStart = parseDateEnv(process.env.STRIPE_PROMO_START);
  const promoEnd = parseDateEnv(process.env.STRIPE_PROMO_END);

  if (!promoStart || !promoEnd) {
    return false;
  }

  return now >= promoStart && now <= promoEnd;
};

/** Returns the currently active Stripe annual price ID and matching display text. */
const getAnnualPlanConfig = () => {
  const promoActive = isAnnualPromoActive();
  const promoPriceId = process.env.STRIPE_PRICE_ANNUAL_PROMO || '';
  const standardPriceId = process.env.STRIPE_PRICE_ANNUAL_STANDARD || '';

  if (promoActive && promoPriceId) {
    return {
      annualPromoActive: true,
      annualPriceId: promoPriceId,
      annualDisplayPrice: ANNUAL_PROMO_DISPLAY_PRICE,
    };
  }

  return {
    annualPromoActive: promoActive,
    annualPriceId: standardPriceId,
    annualDisplayPrice: promoActive ? ANNUAL_PROMO_DISPLAY_PRICE : ANNUAL_STANDARD_DISPLAY_PRICE,
  };
};

/** Returns the public billing config that the client can safely consume. */
const getPublicBillingConfig = () => {
  const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY || '';
  const annualPlan = getAnnualPlanConfig();
  const billingEnabled = Boolean(
    process.env.STRIPE_SECRET_KEY &&
      monthlyPriceId &&
      annualPlan.annualPriceId
  );

  return {
    billingEnabled,
    checkoutEnabled: billingEnabled && hasFirebaseAdminConfig(),
    annualPromoActive: annualPlan.annualPromoActive,
    monthlyDisplayPrice: MONTHLY_DISPLAY_PRICE,
    annualDisplayPrice: annualPlan.annualDisplayPrice,
    monthlyPriceId,
    annualPriceId: annualPlan.annualPriceId,
  };
};

module.exports = {
  getBaseUrl,
  getPublicBillingConfig,
  isAnnualPromoActive,
};
