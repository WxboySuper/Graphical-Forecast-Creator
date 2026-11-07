/**
 * Billing webhook entitlement resolvers.
 *
 * This module translates Stripe webhook events into entitlement writes and billing state changes. Signature verification and HTTP response handling belong to the webhook route.
 */
'use strict';

const {
  createCheckoutEntitlementWrite,
  createSubscriptionEntitlementWrite,
  getSubscriptionUid,
} = require('./billing-entitlement-builders');

/** Reads a subscription identifier or expanded object from an invoice payload. */
const getInvoiceSubscription = (invoice) =>
  invoice.subscription || invoice.parent?.subscription_details?.subscription || null;

/** Reads the subscription object associated with a supported Stripe event. */
const getWebhookSubscription = (event) => {
  const object = event.data.object;
  if (event.type.startsWith('customer.subscription.')) {
    return object;
  }
  if (event.type === 'checkout.session.completed') {
    return object.subscription || null;
  }
  return getInvoiceSubscription(object);
};

/** Retrieves current Stripe lifecycle state when an event contains only an identifier. */
const resolveAuthoritativeSubscription = async (stripe, event) => {
  const subscription = getWebhookSubscription(event);
  if (!subscription) {
    return null;
  }
  if (typeof subscription === 'object') {
    return subscription;
  }
  try {
    return await stripe.subscriptions.retrieve(subscription);
  } catch (error) {
    // Delayed or retried events can reference a subscription that was deleted
    // in the meantime (for example by account deletion). Treat it as absent.
    if (error?.code === 'resource_missing') return null;
    throw error;
  }
};

/** Preserves checkout metadata when Stripe has not copied it to the subscription yet. */
const withFallbackSubscriptionUid = (subscription, fallbackUid) => ({
  ...subscription,
  metadata: {
    ...(subscription.metadata || {}),
    ...(subscription.metadata?.uid || !fallbackUid ? {} : { uid: fallbackUid }),
  },
});

/** Builds the entitlement write from the current subscription or the Checkout session. */
const buildCheckoutEntitlementWrite = async (stripe, event, session) => {
  const subscription = await resolveAuthoritativeSubscription(stripe, event);
  return subscription
    ? createSubscriptionEntitlementWrite(withFallbackSubscriptionUid(subscription, session.metadata?.uid))
    : createCheckoutEntitlementWrite(session);
};

/** Resolves the UID from subscription or invoice metadata. */
const resolveInvoiceUid = (subscription, invoice) =>
  getSubscriptionUid(subscription) ||
  invoice.parent?.subscription_details?.metadata?.uid ||
  invoice.subscription_details?.metadata?.uid ||
  '';

module.exports = {
  buildCheckoutEntitlementWrite,
  getInvoiceSubscription,
  getWebhookSubscription,
  resolveAuthoritativeSubscription,
  resolveInvoiceUid,
  withFallbackSubscriptionUid,
};
