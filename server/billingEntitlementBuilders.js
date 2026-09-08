/**
 * Translates Stripe customer and subscription data into GFC entitlement records.
 * This module owns billing entitlement normalization; it does not call Stripe or write entitlement storage.
 */
'use strict';

const { getSubscriptionPeriodEndUnix } = require('./billing-stripe-period');
const { getStripeObjectId } = require('./billing-cleanup');

/** Maps a Stripe recurring interval into the entitlement interval shape. */
const getPlanInterval = (interval) => (interval === 'year' ? 'annual' : 'monthly');

/** Normalizes a Stripe customer identifier into a nullable string. */
const getStripeCustomerId = (value) => (typeof value === 'string' ? value : null);

/** Normalizes a Stripe subscription identifier into a nullable string. */
const getStripeSubscriptionId = (value) => (typeof value === 'string' ? value : null);

/** Converts a Stripe Unix timestamp into a nullable JavaScript date. */
const getStripeDate = (value) => (value ? new Date(value * 1000) : null);

/** Builds the entitlement write for a completed Checkout session. */
const createCheckoutEntitlementWrite = (session) => {
  const uid = session.metadata?.uid || '';
  const stripeCustomerId = getStripeCustomerId(session.customer);
  const stripeSubscriptionId = getStripeSubscriptionId(session.subscription);

  return {
    uid,
    stripeCustomerId,
    stripeSubscriptionId,
    payload: {
      uid,
      planInterval: session.metadata?.plan === 'annual' ? 'annual' : 'monthly',
      billingStatus: 'active',
      stripeCustomerId,
      stripeSubscriptionId,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
  };
};

/** Reads the Firebase UID stored on a subscription webhook object. */
const getSubscriptionUid = (subscription) => subscription.metadata?.uid || '';

/** Builds the entitlement payload for a subscription lifecycle update. */
const createSubscriptionEntitlementPayload = (subscription, uid, stripeCustomerId) => ({
  uid,
  planInterval: getPlanInterval(subscription.items?.data?.[0]?.price?.recurring?.interval),
  billingStatus: subscription.status || 'inactive',
  stripeCustomerId,
  stripeSubscriptionId: subscription.id,
  cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  currentPeriodEnd: getStripeDate(getSubscriptionPeriodEndUnix(subscription)),
});

/** Builds the entitlement write for a subscription lifecycle update. */
const createSubscriptionEntitlementWrite = (subscription) => {
  const uid = getSubscriptionUid(subscription);
  const stripeCustomerId = getStripeCustomerId(subscription.customer);

  return {
    uid,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    payload: createSubscriptionEntitlementPayload(subscription, uid, stripeCustomerId),
  };
};

/** Returns the first usable Stripe identifier from expanded objects or plain IDs. */
const getFirstStripeObjectId = (values) => values.map(getStripeObjectId).find(Boolean) || '';

/** Finds the payment intent across current and legacy Checkout invoice shapes. */
const getCheckoutPaymentIntentId = (session, invoice, payments) =>
  getFirstStripeObjectId([
    session.payment_intent,
    invoice?.payment_intent,
    ...payments.map((payment) => payment?.payment?.payment_intent),
  ]);

/** Finds a charge-only payment across current and legacy invoice shapes. */
const getCheckoutChargeId = (invoice, payments) =>
  getFirstStripeObjectId([
    ...payments.map((payment) => payment?.payment?.charge),
    invoice?.charge,
  ]);

/** Finds the initial Checkout payment across Stripe invoice shapes. */
const getCheckoutRefundTarget = (session, subscription) => {
  const invoice = subscription?.latest_invoice;
  const payments = invoice?.payments?.data || [];
  const paymentIntent = getCheckoutPaymentIntentId(session, invoice, payments);
  if (paymentIntent) return { payment_intent: paymentIntent };

  const charge = getCheckoutChargeId(invoice, payments);
  return charge ? { charge } : null;
};

module.exports = {
  createCheckoutEntitlementWrite,
  createSubscriptionEntitlementPayload,
  createSubscriptionEntitlementWrite,
  getCheckoutRefundTarget,
  getPlanInterval,
  getSubscriptionUid,
};
