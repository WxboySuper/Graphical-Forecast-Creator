'use strict';

const { deleteStripeCustomer } = require('./account-lifecycle');

/** Redacts identifiers in logs so server output stays useful without exposing full values. */
const redactIdentifier = (value) => {
  if (typeof value !== 'string' || value.length <= 4) {
    return value || null;
  }

  return `...${value.slice(-4)}`;
};

/** Returns the Stripe object ID for either an expanded object or a plain ID. */
const getStripeObjectId = (value) => (typeof value === 'string' ? value : value?.id || '');

/** Returns the first usable Stripe ID from a list of expanded objects or plain IDs. */
const getFirstStripeObjectId = (values) => values.map(getStripeObjectId).find(Boolean) || '';

/** Finds the payment intent across Checkout and legacy/current invoice shapes. */
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

/** Finds the initial Checkout payment across Stripe's legacy and current invoice shapes. */
const getCheckoutRefundTarget = (session, subscription) => {
  const invoice = subscription?.latest_invoice;
  const payments = invoice?.payments?.data || [];
  const paymentIntent = getCheckoutPaymentIntentId(session, invoice, payments);
  if (paymentIntent) return { payment_intent: paymentIntent };

  const charge = getCheckoutChargeId(invoice, payments);
  return charge ? { charge } : null;
};

/** Returns the UID only when this Checkout belongs to an account blocked from writes. */
const getBlockedCheckoutUid = async (session, canWrite) => {
  const uid = session.client_reference_id || session.metadata?.uid || '';
  if (!uid) return null;
  return (await canWrite(uid)) ? null : uid;
};

/** Retrieves the expanded first invoice for a subscription-mode Checkout session. */
const getCheckoutSubscription = async (stripe, session) => {
  const subscriptionId = getStripeObjectId(session.subscription);
  if (!subscriptionId) return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  } catch (error) {
    if (error?.code === 'resource_missing') return null;
    throw error;
  }
};

/** Resolves a refundable payment using both legacy invoice fields and the current payments API. */
const resolveCheckoutRefundTarget = async (stripe, session, subscription) => {
  const embeddedTarget = getCheckoutRefundTarget(session, subscription);
  if (embeddedTarget) return embeddedTarget;

  const invoiceId = getStripeObjectId(subscription?.latest_invoice);
  if (!invoiceId || !stripe.invoicePayments?.list) return null;
  const invoicePayments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  return getCheckoutRefundTarget(session, {
    latest_invoice: { payments: { data: invoicePayments.data || [] } },
  });
};

/** Prevents a paid late Checkout from being cleaned up without its required refund. */
const ensurePaidCheckoutHasRefundTarget = (session, refundTarget) => {
  if (session.payment_status !== 'paid' || refundTarget) return;
  throw new Error(`Unable to identify payment for deleted-account Checkout session ${session.id}.`);
};

/** Creates the refund only when Checkout actually produced a refundable payment. */
const refundBlockedCheckout = async (stripe, session, refundTarget) => {
  if (!refundTarget) return;
  await stripe.refunds.create(refundTarget, {
    idempotencyKey: `account-deletion-checkout-refund:${session.id}`,
  });
};

/**
 * Refunds a Checkout payment that completed after account deletion, then removes
 * the newly created Stripe customer. Throwing keeps the webhook retryable.
 */
const cleanupBlockedCheckoutSession = async (
  session,
  { stripe, canWrite, redactIdentifier: redactFn } = {}
) => {
  const redact = redactFn || redactIdentifier;
  const uid = await getBlockedCheckoutUid(session, canWrite);
  if (!uid) return false;
  if (!stripe) throw new Error('Stripe is not configured for late Checkout cleanup.');

  if (session.payment_status === 'unpaid') return false;

  const subscription = await getCheckoutSubscription(stripe, session);
  const refundTarget = await resolveCheckoutRefundTarget(stripe, session, subscription);
  ensurePaidCheckoutHasRefundTarget(session, refundTarget);
  await refundBlockedCheckout(stripe, session, refundTarget);

  await deleteStripeCustomer({ stripe, customerId: getStripeObjectId(session.customer) });
  console.warn('[billing] checkout:refunded-deleted-user', {
    uid,
    sessionId: redact(session.id),
  });
  return true;
};

/** Finds a payment intent from invoice payments list via the Invoice Payments API. */
const findPaymentIntentFromInvoicePayments = async (stripe, invoiceId) => {
  if (!stripe.invoicePayments?.list || !invoiceId) return null;
  const invoicePayments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  return getFirstStripeObjectId(invoicePayments.data.map((payment) => payment?.payment?.payment_intent));
};

/** Resolves a refundable payment intent from an invoice across legacy and current Stripe shapes. */
const resolveInvoicePaymentIntentId = async (stripe, invoice) => {
  const legacyPaymentIntent = getStripeObjectId(invoice.payment_intent);
  if (legacyPaymentIntent) return legacyPaymentIntent;

  const fromPayments = getFirstStripeObjectId(
    (invoice.payments?.data || []).map((payment) => payment?.payment?.payment_intent),
  );
  return fromPayments || findPaymentIntentFromInvoicePayments(stripe, getStripeObjectId(invoice.id));
};

/** Refunds a late invoice payment and removes the Stripe customer for a deleted account. */
const refundDeletedAccountInvoice = async (invoice, { stripe, customerId }) => {
  if (!stripe) return;
  const paymentIntentId = await resolveInvoicePaymentIntentId(stripe, invoice);
  if (!paymentIntentId) return;
  await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `account-deletion-invoice-refund:${getStripeObjectId(invoice.id)}` },
  );
  await deleteStripeCustomer({ stripe, customerId });
};

module.exports = {
  cleanupBlockedCheckoutSession,
  getCheckoutRefundTarget,
  getStripeObjectId,
  refundDeletedAccountInvoice,
};
