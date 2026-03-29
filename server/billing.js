'use strict';

const Stripe = require('stripe');
const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const { getBaseUrl, getBillingRuntimeConfig, getPublicBillingConfig } = require('./billing-config');

let stripeClient = null;
const routeRateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = {
  checkout: { maxRequests: 5, windowMs: RATE_LIMIT_WINDOW_MS },
  portal: { maxRequests: 10, windowMs: RATE_LIMIT_WINDOW_MS },
};

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

/** Returns the client IP the server should use for lightweight route-level rate limiting. */
const getClientIp = (req) =>
  ((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') + '').split(',')[0].trim() || 'unknown';

/** Removes stale rate-limit entries so the in-memory map stays bounded over time. */
const pruneExpiredRateLimitEntries = (now) => {
  routeRateLimitBuckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      routeRateLimitBuckets.delete(key);
    }
  });
};

/** Builds the per-route rate-limit key for the current request. */
const getRateLimitKey = (routeName, req) => `${routeName}:${getClientIp(req)}`;

/** Enforces a lightweight per-IP rate limit on sensitive billing routes. */
const applyRouteRateLimit = (routeName, req, res) => {
  const limit = RATE_LIMITS[routeName];
  if (!limit) {
    return true;
  }

  const now = Date.now();
  pruneExpiredRateLimitEntries(now);

  const key = getRateLimitKey(routeName, req);
  const bucket = routeRateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    routeRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + limit.windowMs,
    });
    return true;
  }

  if (bucket.count >= limit.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('Retry-After', `${retryAfterSeconds}`);
    res.status(429).json({ error: 'Too many billing requests right now. Please wait a moment and try again.' });
    return false;
  }

  bucket.count += 1;
  return true;
};

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
    console.warn('[billing] writeEntitlement:skipped-no-doc-ref', {
      uid,
      stripeCustomerId: redactIdentifier(stripeCustomerId),
      stripeSubscriptionId: redactIdentifier(stripeSubscriptionId),
    });
    return;
  }

  const nextPayload = computeEffectiveEntitlement({
    uid: uid || existing.data.uid || '',
    planInterval: null,
    billingStatus: 'inactive',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    betaOverrideActive: Boolean(existing.data.betaOverrideActive),
    ...existing.data,
    ...payload,
    updatedAt: new Date(),
  });

  try {
    await existing.ref.set(nextPayload, { merge: true });
  } catch (error) {
    console.error('[billing] writeEntitlement:error', {
      uid: nextPayload.uid,
      stripeCustomerId: redactIdentifier(stripeCustomerId),
      stripeSubscriptionId: redactIdentifier(stripeSubscriptionId),
      billingStatus: nextPayload.billingStatus,
      planInterval: nextPayload.planInterval,
      error: error instanceof Error ? error.message : 'Unknown Firestore write failure',
    });
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
const handleCheckout = async (req, res) => {
  const billingConfig = getBillingRuntimeConfig();
  const stripe = getStripeClient();
  if (!stripe || !billingConfig.checkoutEnabled) {
    res.status(503).json({ error: 'Billing is not available on this deployment yet.' });
    return;
  }

  const decodedToken = await verifyRequestUser(req, res);
  if (!decodedToken) {
    return;
  }

  const plan = req.body?.plan;
  const priceId = plan === 'monthly' ? billingConfig.monthlyPriceId : plan === 'annual' ? billingConfig.annualPriceId : '';
  if (!priceId) {
    res.status(400).json({ error: 'Invalid billing plan selected.' });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/account?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    ...(getCheckoutCustomerEmail(decodedToken) ? { customer_email: getCheckoutCustomerEmail(decodedToken) } : {}),
    metadata: {
      uid: decodedToken.uid,
      plan,
    },
    subscription_data: {
      metadata: {
        uid: decodedToken.uid,
        plan,
      },
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

/** Applies the checkout-complete event to the entitlement document. */
const handleCheckoutSessionCompleted = async (session) => {
  await writeEntitlement({
    uid: session.metadata?.uid || '',
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
    stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
    payload: {
      uid: session.metadata?.uid || '',
      planInterval: session.metadata?.plan === 'annual' ? 'annual' : 'monthly',
      billingStatus: 'active',
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
      stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
  });
};

/** Applies the subscription lifecycle event to the entitlement document. */
const handleSubscriptionEvent = async (subscription) => {
  await writeEntitlement({
    uid: subscription.metadata?.uid || '',
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
    stripeSubscriptionId: subscription.id,
    payload: {
      uid: subscription.metadata?.uid || '',
      planInterval: getPlanInterval(subscription.items?.data?.[0]?.price?.recurring?.interval),
      billingStatus: subscription.status || 'inactive',
      stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
      stripeSubscriptionId: subscription.id,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
    },
  });
};

/** Applies invoice payment results to the entitlement document. */
const handleInvoiceEvent = async (eventType, invoice) => {
  await writeEntitlement({
    uid: getInvoiceUid(invoice),
    stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : null,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    payload: {
      uid: getInvoiceUid(invoice),
      planInterval: getPlanInterval(invoice.lines?.data?.[0]?.price?.recurring?.interval),
      billingStatus: eventType === 'invoice.paid' ? 'active' : 'past_due',
      stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : null,
      stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    },
  });
};

const webhookHandlers = {
  'checkout.session.completed': (event) => handleCheckoutSessionCompleted(event.data.object),
  'customer.subscription.updated': (event) => handleSubscriptionEvent(event.data.object),
  'customer.subscription.deleted': (event) => handleSubscriptionEvent(event.data.object),
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
const wrapBillingJsonRoute = (handler, fallbackMessage, routeName) => async (req, res) => {
  if (routeName && !applyRouteRateLimit(routeName, req, res)) {
    return;
  }

  try {
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : fallbackMessage });
  }
};

/** Registers the billing endpoints on the existing hosted-service Express app. */
const registerBillingRoutes = (app, express) => {
  app.get('/api/billing/config', handleBillingConfig);
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleBillingWebhook);
  app.post(
    '/api/billing/checkout',
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute(handleCheckout, 'Unable to create checkout session.', 'checkout')
  );
  app.post(
    '/api/billing/portal',
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute(handleBillingPortal, 'Unable to open the billing portal.', 'portal')
  );
};

module.exports = {
  registerBillingRoutes,
};
