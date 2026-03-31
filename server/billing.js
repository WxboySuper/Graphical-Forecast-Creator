'use strict';

const Stripe = require('stripe');
const rateLimit = require('express-rate-limit');
const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const { getBaseUrl, getBillingRuntimeConfig, getPublicBillingConfig } = require('./billing-config');
const { recordBillingMetricEvent } = require('./metrics');

let stripeClient = null;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
/** Creates a standard billing rate-limit middleware with the given request cap. */
const createBillingRateLimitMiddleware = (max) =>
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many billing requests right now. Please wait a moment and try again.' },
  });

const checkoutRateLimit = createBillingRateLimitMiddleware(5);
const portalRateLimit = createBillingRateLimitMiddleware(10);
const webhookRateLimit = createBillingRateLimitMiddleware(100);

/** Returns the Stripe SDK client when the current deployment is configured for billing. */
const getStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
};

/** Redacts identifiers in logs so server output stays useful without exposing full values. */
const redactIdentifier = (value) => {
  if (typeof value !== 'string' || value.length <= 4) {
    return value || null;
  }

  return `...${value.slice(-4)}`;
};

/** Returns a Stripe-compatible customer email only when the decoded token actually includes one. */
const getCheckoutCustomerEmail = (decodedToken) =>
  typeof decodedToken.email === 'string' && decodedToken.email.trim() ? decodedToken.email : undefined;

/** True when the user should retain premium access from Stripe state alone. */
const isStripePremiumStatus = (billingStatus) => billingStatus === 'active' || billingStatus === 'trialing';

/** Builds the effective entitlement fields while preserving beta-override access. */
const computeEffectiveEntitlement = (payload) => {
  const betaOverrideActive = Boolean(payload.betaOverrideActive);
  const stripePremiumActive = isStripePremiumStatus(payload.billingStatus);
  const premiumActive = betaOverrideActive || stripePremiumActive;

  return {
    ...payload,
    premiumActive,
    effectiveSource: betaOverrideActive ? 'beta_override' : stripePremiumActive ? 'stripe' : 'none',
  };
};

/** Builds the baseline entitlement payload before incoming webhook fields are merged in. */
const createBaseEntitlementPayload = (uid, existingData) => ({
  uid: uid || existingData.uid || '',
  planInterval: null,
  billingStatus: 'inactive',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  betaOverrideActive: Boolean(existingData.betaOverrideActive),
  ...existingData,
  updatedAt: new Date(),
});

/** Logs the skipped write case where no Firestore document target could be resolved. */
const logSkippedEntitlementWrite = ({ uid, stripeCustomerId, stripeSubscriptionId }) => {
  console.warn('[billing] writeEntitlement:skipped-no-doc-ref', {
    uid,
    stripeCustomerId: redactIdentifier(stripeCustomerId),
    stripeSubscriptionId: redactIdentifier(stripeSubscriptionId),
  });
};

/** Logs a Firestore entitlement write failure with redacted Stripe identifiers. */
const logEntitlementWriteError = ({ uid, stripeCustomerId, stripeSubscriptionId, nextPayload, error }) => {
  console.error('[billing] writeEntitlement:error', {
    uid: nextPayload.uid || uid,
    stripeCustomerId: redactIdentifier(stripeCustomerId),
    stripeSubscriptionId: redactIdentifier(stripeSubscriptionId),
    billingStatus: nextPayload.billingStatus,
    planInterval: nextPayload.planInterval,
    error: error instanceof Error ? error.message : 'Unknown Firestore write failure',
  });
};

/** Fetches one entitlement document by UID. */
const getEntitlementDocByUid = (uid) => {
  const db = getAdminDb();
  if (!db) {
    return null;
  }

  return db.collection('userEntitlements').doc(uid).get();
};

/** Finds an entitlement document using Stripe identifiers when the webhook payload lacks a UID. */
const findEntitlementDocByField = async (field, value) => {
  const db = getAdminDb();
  if (!db || !value) {
    return null;
  }

  const query = await db.collection('userEntitlements').where(field, '==', value).limit(1).get();
  return query.empty ? null : query.docs[0];
};

/** Finds an entitlement document using Stripe identifiers when the webhook payload lacks a UID. */
const findEntitlementDocByStripeIdentifiers = async ({ stripeCustomerId, stripeSubscriptionId }) => {
  return (
    await findEntitlementDocByField('stripeSubscriptionId', stripeSubscriptionId)
  ) || findEntitlementDocByField('stripeCustomerId', stripeCustomerId);
};

/** Reads the existing entitlement document so webhook updates preserve beta overrides. */
const createNewEntitlementTarget = (uid) => {
  const db = getAdminDb();
  if (!db || !uid) {
    return null;
  }

  return {
    ref: db.collection('userEntitlements').doc(uid),
    data: {},
  };
};

/** Reads the existing entitlement document so webhook updates preserve beta overrides. */
const getExistingEntitlementData = async (uid, stripeIds = {}) => {
  const directDoc = uid ? await getEntitlementDocByUid(uid) : null;
  if (directDoc?.exists) {
    return { ref: directDoc.ref, data: directDoc.data() || {} };
  }

  const stripeDoc = await findEntitlementDocByStripeIdentifiers(stripeIds);
  if (stripeDoc) {
    return { ref: stripeDoc.ref, data: stripeDoc.data() || {} };
  }

  return createNewEntitlementTarget(uid);
};

/** Writes the merged entitlement payload into Firestore. */
const writeEntitlement = async ({ uid, stripeCustomerId, stripeSubscriptionId, payload }) => {
  console.log('[billing] writeEntitlement:start', {
    uid,
    stripeCustomerId: redactIdentifier(stripeCustomerId),
    stripeSubscriptionId: redactIdentifier(stripeSubscriptionId),
    billingStatus: payload?.billingStatus,
    planInterval: payload?.planInterval,
  });

  const existing = await getExistingEntitlementData(uid, { stripeCustomerId, stripeSubscriptionId });
  if (!existing) {
    logSkippedEntitlementWrite({ uid, stripeCustomerId, stripeSubscriptionId });
    return;
  }

  const nextPayload = computeEffectiveEntitlement({
    ...createBaseEntitlementPayload(uid, existing.data),
    ...payload,
  });

  try {
    await existing.ref.set(nextPayload, { merge: true });
  } catch (error) {
    logEntitlementWriteError({ uid, stripeCustomerId, stripeSubscriptionId, nextPayload, error });
    throw error;
  }

  console.log('[billing] writeEntitlement:success', {
    uid: nextPayload.uid,
    premiumActive: nextPayload.premiumActive,
    effectiveSource: nextPayload.effectiveSource,
    billingStatus: nextPayload.billingStatus,
  });
};

/** Extracts a verified Firebase user from the Authorization header. */
const verifyRequestUser = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const adminAuth = getAdminAuth();

  if (!adminAuth || !hasFirebaseAdminConfig()) {
    res.status(503).json({ error: 'Firebase Admin is not configured on this deployment.' });
    return null;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing Firebase ID token.' });
    return null;
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid Firebase ID token.' });
    return null;
  }
};

/** Creates the plan-specific Stripe checkout session for the verified user. */
const isCheckoutAvailable = (stripe, billingConfig) => Boolean(stripe && billingConfig.checkoutEnabled);

/** Resolves the Stripe price id for the selected billing plan. */
const getCheckoutPriceId = (plan, billingConfig) => {
  if (plan === 'monthly') {
    return billingConfig.monthlyPriceId;
  }

  if (plan === 'annual') {
    return billingConfig.annualPriceId;
  }

  return '';
};

/** Builds the checkout metadata shared between the session and subscription objects. */
const createCheckoutMetadata = (uid, plan) => ({ uid, plan });

/** Creates the plan-specific Stripe checkout session for the verified user. */
const handleCheckout = async (req, res) => {
  const billingConfig = getBillingRuntimeConfig();
  const stripe = getStripeClient();
  if (!isCheckoutAvailable(stripe, billingConfig)) {
    res.status(503).json({ error: 'Billing is not available on this deployment yet.' });
    return;
  }

  const decodedToken = await verifyRequestUser(req, res);
  if (!decodedToken) {
    return;
  }

  const plan = req.body?.plan;
  const priceId = getCheckoutPriceId(plan, billingConfig);
  if (!priceId) {
    res.status(400).json({ error: 'Invalid billing plan selected.' });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const metadata = createCheckoutMetadata(decodedToken.uid, plan);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/account?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    ...(getCheckoutCustomerEmail(decodedToken) ? { customer_email: getCheckoutCustomerEmail(decodedToken) } : {}),
    metadata,
    subscription_data: {
      metadata,
    },
  });

  res.json({ url: session.url });
};

/** Opens the Stripe billing portal for a user who already has a customer record. */
const handleBillingPortal = async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(503).json({ error: 'Billing is not available on this deployment yet.' });
    return;
  }

  const decodedToken = await verifyRequestUser(req, res);
  if (!decodedToken) {
    return;
  }

  const entitlementDoc = await getEntitlementDocByUid(decodedToken.uid);
  const entitlementData = entitlementDoc?.data() || {};
  if (!entitlementData.stripeCustomerId) {
    res.status(400).json({ error: 'No Stripe customer is attached to this account yet.' });
    return;
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: entitlementData.stripeCustomerId,
    return_url: `${getBaseUrl(req)}/account`,
  });

  res.json({ url: portal.url });
};

/** Maps Stripe recurring intervals into the entitlement interval shape. */
const getPlanInterval = (interval) => (interval === 'year' ? 'annual' : 'monthly');

/** Extracts the most reliable UID from an invoice payload. */
const getInvoiceUid = (invoice) =>
  invoice.parent?.subscription_details?.metadata?.uid || invoice.subscription_details?.metadata?.uid || '';

/** Normalizes a Stripe API customer id into a nullable string. */
const getStripeCustomerId = (value) => (typeof value === 'string' ? value : null);

/** Normalizes a Stripe API subscription id into a nullable string. */
const getStripeSubscriptionId = (value) => (typeof value === 'string' ? value : null);

/** Converts Stripe unix timestamps into nullable JS dates. */
const getStripeDate = (value) => (value ? new Date(value * 1000) : null);

/** Builds the entitlement payload for a checkout completion event. */
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

/** Builds the entitlement payload for subscription lifecycle updates. */
const getSubscriptionUid = (subscription) => subscription.metadata?.uid || '';

/** Builds the nested payload for a subscription webhook entitlement update. */
const createSubscriptionEntitlementPayload = (subscription, uid, stripeCustomerId) => ({
  uid,
  planInterval: getPlanInterval(subscription.items?.data?.[0]?.price?.recurring?.interval),
  billingStatus: subscription.status || 'inactive',
  stripeCustomerId,
  stripeSubscriptionId: subscription.id,
  cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  currentPeriodEnd: getStripeDate(subscription.current_period_end),
});

/** Builds the entitlement payload for subscription lifecycle updates. */
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

/** Builds the entitlement payload for invoice payment events. */
const createInvoiceEntitlementWrite = (eventType, invoice) => {
  const uid = getInvoiceUid(invoice);
  const stripeCustomerId = getStripeCustomerId(invoice.customer);
  const stripeSubscriptionId = getStripeSubscriptionId(invoice.subscription);

  return {
    uid,
    stripeCustomerId,
    stripeSubscriptionId,
    payload: {
      uid,
      planInterval: getPlanInterval(invoice.lines?.data?.[0]?.price?.recurring?.interval),
      billingStatus: eventType === 'invoice.paid' ? 'active' : 'past_due',
      stripeCustomerId,
      stripeSubscriptionId,
    },
  };
};

/** Applies the checkout-complete event to the entitlement document. */
const recordBillingMetricEventSafely = async (eventType) => {
  try {
    await recordBillingMetricEvent(eventType);
  } catch (error) {
    console.warn('[billing] metrics:nonfatal', {
      eventType,
      error: error instanceof Error ? error.message : 'Unknown billing metrics failure',
    });
  }
};

/** Applies the checkout-complete event to the entitlement document. */
const handleCheckoutSessionCompleted = async (session) => {
  await writeEntitlement(createCheckoutEntitlementWrite(session));
  await recordBillingMetricEventSafely('premium_upgrade');
};

/** Applies the subscription lifecycle event to the entitlement document. */
const handleSubscriptionEvent = async (subscription, eventType) => {
  await writeEntitlement(createSubscriptionEntitlementWrite(subscription));
  if (eventType === 'customer.subscription.deleted') {
    await recordBillingMetricEventSafely('premium_cancellation');
  }
};

/** Applies invoice payment results to the entitlement document. */
const handleInvoiceEvent = (eventType, invoice) => writeEntitlement(createInvoiceEntitlementWrite(eventType, invoice));

const webhookHandlers = {
  'checkout.session.completed': (event) => handleCheckoutSessionCompleted(event.data.object),
  'customer.subscription.updated': (event) => handleSubscriptionEvent(event.data.object, event.type),
  'customer.subscription.deleted': (event) => handleSubscriptionEvent(event.data.object, event.type),
  'invoice.paid': (event) => handleInvoiceEvent(event.type, event.data.object),
  'invoice.payment_failed': (event) => handleInvoiceEvent(event.type, event.data.object),
};

/** Returns the event handler for a Stripe webhook type, if the app cares about it. */
const getWebhookHandler = (eventType) => webhookHandlers[eventType] || null;

/** Handles checkout completion and subscription lifecycle events from Stripe. */
const handleWebhookEvent = async (event) => {
  console.log('[billing] webhook:event', event.type);

  const handler = getWebhookHandler(event.type);
  if (!handler) {
    console.log('[billing] webhook:ignored', event.type);
    return;
  }

  await handler(event);
};

/** Writes the public billing config response used by the client. */
const handleBillingConfig = (_req, res) => {
  const publicConfig = getPublicBillingConfig();
  res.json({
    billingEnabled: publicConfig.billingEnabled,
    checkoutEnabled: publicConfig.checkoutEnabled,
    annualPromoActive: publicConfig.annualPromoActive,
    monthlyDisplayPrice: publicConfig.monthlyDisplayPrice,
    annualDisplayPrice: publicConfig.annualDisplayPrice,
  });
};

/** Handles webhook requests once Stripe availability has been confirmed. */
const processWebhookRequest = async (req, res, stripe, webhookSecret) => {
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    await handleWebhookEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[billing] webhook:error', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook payload.' });
  }
};

/** Rejects webhook requests when Stripe is not fully configured. */
const handleBillingWebhook = async (req, res) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    res.status(503).json({ error: 'Stripe webhooks are not configured on this deployment.' });
    return;
  }

  await processWebhookRequest(req, res, stripe, webhookSecret);
};

/** Generic wrapper for billing JSON routes with shared error handling. */
const wrapBillingJsonRoute = ({ handler, fallbackMessage }) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : fallbackMessage });
  }
};

/** Registers the billing endpoints on the existing hosted-service Express app. */
const registerBillingRoutes = (app, express) => {
  app.get('/api/billing/config', handleBillingConfig);
  app.post(
    '/api/billing/webhook',
    webhookRateLimit,
    express.raw({ type: 'application/json' }),
    handleBillingWebhook
  );
  app.post(
    '/api/billing/checkout',
    checkoutRateLimit,
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute({
      handler: handleCheckout,
      fallbackMessage: 'Unable to create checkout session.',
    })
  );
  app.post(
    '/api/billing/portal',
    portalRateLimit,
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute({
      handler: handleBillingPortal,
      fallbackMessage: 'Unable to open the billing portal.',
    })
  );
};

module.exports = {
  registerBillingRoutes,
};
