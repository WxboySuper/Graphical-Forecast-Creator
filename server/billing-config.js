'use strict';

const { hasFirebaseAdminConfig } = require('./firebase-admin');
const { getServerTarget } = require('./lib/serverTarget');

const CLOUDFLARE_BETA_ORIGIN = 'https://beta.gfcweather.com';

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

/** Returns the configured Stripe annual promo price ID, if one exists. */
const getAnnualPromoPriceId = () => process.env.STRIPE_PRICE_ANNUAL_PROMO || '';

/** Returns the public base URL used for Stripe return links. */
const getBaseUrl = (env = process.env) =>
  env.APP_BASE_URL || 'http://127.0.0.1:3000';

/** Normalizes a URL or Origin header value into an origin string. */
const normalizeOrigin = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

/** Returns the browser origins that may receive Stripe billing return URLs. */
const getAllowedBillingReturnOrigins = (env = process.env) => {
  const origins = new Set();
  const configuredOrigin = normalizeOrigin(env.APP_BASE_URL);
  if (configuredOrigin) {
    origins.add(configuredOrigin);
  }

  if (getServerTarget(env) === 'beta') {
    origins.add(CLOUDFLARE_BETA_ORIGIN);
  }

  return origins;
};

/**
 * Resolves the public base URL for Stripe return links.
 * Honors the request Origin when it matches an allowed beta or configured host.
 */
const getBillingReturnBaseUrl = (req, env = process.env) => {
  const requestOrigin = normalizeOrigin(req?.headers?.origin);
  if (requestOrigin && getAllowedBillingReturnOrigins(env).has(requestOrigin)) {
    return requestOrigin;
  }

  return getBaseUrl(env);
};

/** True when the annual intro pricing window is currently active. */
const isAnnualPromoActive = () => {
  if (!getAnnualPromoPriceId()) {
    return false;
  }

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
  const promoPriceId = getAnnualPromoPriceId();
  const standardPriceId = process.env.STRIPE_PRICE_ANNUAL_STANDARD || '';

  if (promoActive && promoPriceId) {
    return {
      annualPromoActive: true,
      annualPriceId: promoPriceId,
      annualDisplayPrice: ANNUAL_PROMO_DISPLAY_PRICE,
    };
  }

  return {
    annualPromoActive: false,
    annualPriceId: standardPriceId,
    annualDisplayPrice: ANNUAL_STANDARD_DISPLAY_PRICE,
  };
};

/** Returns the full billing config the server needs to resolve checkout sessions. */
const getBillingRuntimeConfig = () => {
  const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY || '';
  const annualPlan = getAnnualPlanConfig();
  const billingEnabled = Boolean(
    process.env.STRIPE_SECRET_KEY &&
      monthlyPriceId &&
      annualPlan.annualPriceId
  );
  const hasBaseUrl = Boolean(process.env.APP_BASE_URL);

  return {
    billingEnabled,
    hasBaseUrl,
    checkoutEnabled: billingEnabled && hasFirebaseAdminConfig() && hasBaseUrl,
    annualPromoActive: annualPlan.annualPromoActive,
    monthlyDisplayPrice: MONTHLY_DISPLAY_PRICE,
    annualDisplayPrice: annualPlan.annualDisplayPrice,
    monthlyPriceId,
    annualPriceId: annualPlan.annualPriceId,
  };
};

/** Returns the public billing config that the client can safely consume. */
const getPublicBillingConfig = () => {
  const runtimeConfig = getBillingRuntimeConfig();
  return {
    billingEnabled: runtimeConfig.billingEnabled,
    checkoutEnabled: runtimeConfig.checkoutEnabled,
    annualPromoActive: runtimeConfig.annualPromoActive,
    monthlyDisplayPrice: runtimeConfig.monthlyDisplayPrice,
    annualDisplayPrice: runtimeConfig.annualDisplayPrice,
  };
};

module.exports = {
  getBaseUrl,
  getBillingReturnBaseUrl,
  getBillingRuntimeConfig,
  getPublicBillingConfig,
  isAnnualPromoActive,
};
