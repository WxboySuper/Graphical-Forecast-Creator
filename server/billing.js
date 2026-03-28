'use strict';

const Stripe = require('stripe');
const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const { getBaseUrl, getPublicBillingConfig } = require('./billing-config');

let stripeClient = null;

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
const getEntitlementDocByUid = async (uid) => {
  const db = getAdminDb();
  if (!db) {
    return null;
  }

  return db.collection('userEntitlements').doc(uid).get();
};

/** Finds an entitlement document using Stripe identifiers when the webhook payload lacks a UID. */
const findEntitlementDocByStripeIdentifiers = async ({ stripeCustomerId, stripeSubscriptionId }) => {
  const db = getAdminDb();
  if (!db) {
    return null;
  }

  if (stripeSubscriptionId) {
    const subscriptionQuery = await db
      .collection('userEntitlements')
      .where('stripeSubscriptionId', '==', stripeSubscriptionId)
      .limit(1)
      .get();
    if (!subscriptionQuery.empty) {
      return subscriptionQuery.docs[0];
    }
  }

  if (stripeCustomerId) {
    const customerQuery = await db
      .collection('userEntitlements')
      .where('stripeCustomerId', '==', stripeCustomerId)
      .limit(1)
      .get();
    if (!customerQuery.empty) {
      return customerQuery.docs[0];
    }
  }

  return null;
};

/** Reads the existing entitlement document so webhook updates preserve beta overrides. */
const getExistingEntitlementData = async (uid, stripeIds = {}) => {
  const directDoc = uid ? await getEntitlementDocByUid(uid) : null;
  if (directDoc && directDoc.exists) {
    return { ref: directDoc.ref, data: directDoc.data() || {} };
  }

  const stripeDoc = await findEntitlementDocByStripeIdentifiers(stripeIds);
  if (stripeDoc) {
    return { ref: stripeDoc.ref, data: stripeDoc.data() || {} };
  }

  const db = getAdminDb();
  if (!db || !uid) {
    return null;
  }

  return {
    ref: db.collection('userEntitlements').doc(uid),
    data: {},
  };
};

/** Writes the merged entitlement payload into Firestore. */
const writeEntitlement = async ({ uid, stripeCustomerId, stripeSubscriptionId, payload }) => {
  console.log('[billing] writeEntitlement:start', {
    uid,
    stripeCustomerId,
    stripeSubscriptionId,
    billingStatus: payload?.billingStatus,
    planInterval: payload?.planInterval,
  });

  const existing = await getExistingEntitlementData(uid, { stripeCustomerId, stripeSubscriptionId });
  if (!existing) {
    console.warn('[billing] writeEntitlement:skipped-no-doc-ref', {
      uid,
      stripeCustomerId,
      stripeSubscriptionId,
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
    updatedAt: new Date(),
    ...existing.data,
    ...payload,
    updatedAt: new Date(),
  });

  await existing.ref.set(nextPayload, { merge: true });
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
  const publicConfig = getPublicBillingConfig();
  const stripe = getStripeClient();
  if (!stripe || !publicConfig.checkoutEnabled) {
    res.status(503).json({ error: 'Billing is not available on this deployment yet.' });
    return;
  }

  const decodedToken = await verifyRequestUser(req, res);
  if (!decodedToken) {
    return;
  }

  const plan = req.body?.plan;
  const priceId = plan === 'monthly' ? publicConfig.monthlyPriceId : plan === 'annual' ? publicConfig.annualPriceId : '';
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
    customer_email: decodedToken.email,
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

/** Handles checkout completion and subscription lifecycle events from Stripe. */
const handleWebhookEvent = async (event) => {
  console.log('[billing] webhook:event', event.type);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
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
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await writeEntitlement({
        uid: subscription.metadata?.uid || '',
        stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
        stripeSubscriptionId: subscription.id,
        payload: {
          uid: subscription.metadata?.uid || '',
          planInterval: subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
          billingStatus: subscription.status || 'inactive',
          stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
          stripeSubscriptionId: subscription.id,
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        },
      });
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const interval = invoice.lines?.data?.[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly';
      await writeEntitlement({
        uid: invoice.parent?.subscription_details?.metadata?.uid || invoice.subscription_details?.metadata?.uid || '',
        stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : null,
        stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
        payload: {
          uid: invoice.parent?.subscription_details?.metadata?.uid || invoice.subscription_details?.metadata?.uid || '',
          planInterval: interval,
          billingStatus: event.type === 'invoice.paid' ? 'active' : 'past_due',
          stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : null,
          stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
        },
      });
      break;
    }
    default:
      console.log('[billing] webhook:ignored', event.type);
      break;
  }
};

/** Registers the billing endpoints on the existing hosted-service Express app. */
const registerBillingRoutes = (app, express) => {
  app.get('/api/billing/config', (_req, res) => {
    const publicConfig = getPublicBillingConfig();
    res.json({
      billingEnabled: publicConfig.billingEnabled,
      checkoutEnabled: publicConfig.checkoutEnabled,
      annualPromoActive: publicConfig.annualPromoActive,
      monthlyDisplayPrice: publicConfig.monthlyDisplayPrice,
      annualDisplayPrice: publicConfig.annualDisplayPrice,
    });
  });

  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !webhookSecret) {
      res.status(503).json({ error: 'Stripe webhooks are not configured on this deployment.' });
      return;
    }

    try {
      const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
      await handleWebhookEvent(event);
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('[billing] webhook:error', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook payload.' });
    }
  });

  app.post('/api/billing/checkout', express.json({ limit: '8kb' }), async (req, res) => {
    try {
      await handleCheckout(req, res);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create checkout session.' });
    }
  });

  app.post('/api/billing/portal', express.json({ limit: '8kb' }), async (req, res) => {
    try {
      await handleBillingPortal(req, res);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to open the billing portal.' });
    }
  });
};

module.exports = {
  registerBillingRoutes,
};
