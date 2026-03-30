'use strict';

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');

const METRIC_EVENT_TYPES = new Set([
  'account_signup',
  'account_signin',
  'cycle_saved',
  'discussion_saved',
  'verification_run',
  'cloud_cycle_saved',
  'cloud_cycle_loaded',
]);
const BILLING_METRIC_EVENT_TYPES = new Set(['premium_upgrade', 'premium_cancellation']);
const ACTIVE_DAY_EVENT_TYPES = new Set([
  'cycle_saved',
  'discussion_saved',
  'verification_run',
  'cloud_cycle_saved',
]);
const USER_METRIC_FIELDS = {
  cycle_saved: 'cyclesCreated',
  discussion_saved: 'discussionsWritten',
  verification_run: 'verificationSessionsRun',
  cloud_cycle_saved: 'cloudCyclesSaved',
};
const ADMIN_EVENT_FIELDS = {
  account_signup: 'signups',
  cloud_cycle_saved: 'cloudSaves',
  cloud_cycle_loaded: 'cloudLoads',
  premium_upgrade: 'upgrades',
  premium_cancellation: 'cancellations',
};
const ADMIN_WINDOW_OPTIONS = new Set([7, 30]);
const DEDUPE_TTL_DAYS = 35;
const METRICS_RATE_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many metrics events right now. Please wait a moment and try again.' },
});
const ADMIN_RATE_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin metric requests right now. Please wait a moment and try again.' },
});

/** Returns today's day key in UTC for admin and user metric rollups. */
const getDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/** Returns true when a string is one of the supported product-metric event types. */
const normalizeMetricEventType = (value) =>
  typeof value === 'string' && METRIC_EVENT_TYPES.has(value) ? value : null;

/** Returns true when a string is one of the supported billing-metric event types. */
const normalizeBillingMetricEventType = (value) =>
  typeof value === 'string' && BILLING_METRIC_EVENT_TYPES.has(value) ? value : null;

/** Returns a capped installation id only when the client provided a non-empty string. */
const readInstallationId = (value) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : null;

/** Returns the UTC day key that immediately precedes the given current day key. */
const getPreviousDayKey = (dayKey) => {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return getDayKey(date);
};

/** Hashes the local installation id so admin dedupe docs never store the raw browser identifier. */
const hashInstallationId = (installationId) =>
  crypto
    .createHash('sha256')
    .update(`${process.env.METRICS_HASH_SALT || ''}:${installationId}`)
    .digest('hex');

/** Returns the Firestore document id for one daily dedupe record. */
const createDedupeDocId = (kind, dayKey, value) => `${kind}:${dayKey}:${value}`;

/** Returns the TTL timestamp for a new dedupe doc. */
const getDedupeExpiryDate = () => {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + DEDUPE_TTL_DAYS);
  return expiresAt;
};

/** Returns the default progress-first user metrics document shape. */
const getDefaultUserMetrics = (uid) => ({
  uid,
  activeDayStreak: 0,
  totalActiveDays: 0,
  cyclesCreated: 0,
  cloudCyclesSaved: 0,
  discussionsWritten: 0,
  verificationSessionsRun: 0,
  lastActiveDate: null,
  updatedAt: new Date(),
});

/** Returns the default aggregate admin metrics document shape. */
const getDefaultAdminDailyMetrics = () => ({
  activeDevices: 0,
  activeSignedInAccounts: 0,
  signups: 0,
  premiumSubscriptions: 0,
  upgrades: 0,
  cancellations: 0,
  cloudSaves: 0,
  cloudLoads: 0,
  storageBytes: 0,
  updatedAt: new Date(),
});

/** True when the event should advance the user's active-day streak and total active-day count. */
const countsAsActiveDay = (eventType) => ACTIVE_DAY_EVENT_TYPES.has(eventType);

/** Builds the next user metrics state for the incoming event without double-counting the same active day. */
const buildNextUserMetrics = ({ uid, existingData, eventType, dayKey }) => {
  const nextMetrics = {
    ...getDefaultUserMetrics(uid),
    ...existingData,
    uid,
    updatedAt: new Date(),
  };
  const counterField = USER_METRIC_FIELDS[eventType];

  if (counterField) {
    nextMetrics[counterField] = Number(nextMetrics[counterField] || 0) + 1;
  }

  if (!countsAsActiveDay(eventType)) {
    return nextMetrics;
  }

  if (nextMetrics.lastActiveDate === dayKey) {
    return nextMetrics;
  }

  nextMetrics.totalActiveDays = Number(nextMetrics.totalActiveDays || 0) + 1;
  nextMetrics.activeDayStreak =
    nextMetrics.lastActiveDate === getPreviousDayKey(dayKey)
      ? Number(nextMetrics.activeDayStreak || 0) + 1
      : 1;
  nextMetrics.lastActiveDate = dayKey;

  return nextMetrics;
};

/** Builds the next daily admin metrics state after applying dedupe wins and aggregate event increments. */
const buildNextAdminDailyMetrics = ({
  existingData,
  eventType,
  storageBytes,
  premiumSubscriptions,
  incrementActiveDevices,
  incrementActiveAccounts,
}) => {
  const nextMetrics = {
    ...getDefaultAdminDailyMetrics(),
    ...existingData,
    updatedAt: new Date(),
  };
  const eventField = ADMIN_EVENT_FIELDS[eventType];

  if (incrementActiveDevices) {
    nextMetrics.activeDevices = Number(nextMetrics.activeDevices || 0) + 1;
  }

  if (incrementActiveAccounts) {
    nextMetrics.activeSignedInAccounts = Number(nextMetrics.activeSignedInAccounts || 0) + 1;
  }

  if (eventField) {
    nextMetrics[eventField] = Number(nextMetrics[eventField] || 0) + 1;
  }

  if (typeof premiumSubscriptions === 'number') {
    nextMetrics.premiumSubscriptions = premiumSubscriptions;
  }

  if (typeof storageBytes === 'number') {
    nextMetrics.storageBytes = storageBytes;
  }

  return nextMetrics;
};

/** Returns the verified Firebase user for requests that need server-side admin authorization. */
const verifyRequestUser = async (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const adminAuth = getAdminAuth();

  if (!adminAuth || !token) {
    return null;
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
};

/** Returns the current server-side admin UID allowlist parsed from env. */
const getAdminUidAllowlist = () =>
  (process.env.ADMIN_UID_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

/** True when the given Firebase uid is allowed to read private admin metrics. */
const isAllowedAdminUid = (uid) => getAdminUidAllowlist().includes(uid);

/** Returns the current number of Stripe-backed premium subscriptions derived from entitlement truth in Firestore. */
const countPremiumSubscriptions = async () => {
  const db = getAdminDb();
  if (!db) {
    return 0;
  }

  const snapshot = await db
    .collection('userEntitlements')
    .where('billingStatus', 'in', ['active', 'trialing'])
    .get();

  return snapshot.size;
};

/** Returns the current total stored cloud payload size across all hosted cycles. */
const getCurrentStorageBytes = async () => {
  const db = getAdminDb();
  if (!db) {
    return 0;
  }

  const snapshot = await db.collection('cloudCycles').get();
  return snapshot.docs.reduce((total, docSnapshot) => {
    const data = docSnapshot.data() || {};
    if (typeof data.payloadBytes === 'number') {
      return total + data.payloadBytes;
    }

    if (typeof data.payloadJson === 'string') {
      return total + data.payloadJson.length;
    }

    return total;
  }, 0);
};

/** Writes one product metric event into Firestore-backed user and admin aggregates. */
const recordMetricEvent = async ({ eventType, installationId, uid }) => {
  const db = getAdminDb();
  if (!db || !eventType) {
    return false;
  }

  const dayKey = getDayKey();
  const dailyRef = db.collection('adminDailyMetrics').doc(dayKey);
  const installationHash = installationId ? hashInstallationId(installationId) : null;
  const deviceDedupeRef = installationHash
    ? db.collection('adminMetricDedupes').doc(createDedupeDocId('device', dayKey, installationHash))
    : null;
  const accountDedupeRef = uid
    ? db.collection('adminMetricDedupes').doc(createDedupeDocId('account', dayKey, uid))
    : null;
  const userMetricsRef = uid ? db.collection('userMetrics').doc(uid) : null;
  const [premiumSubscriptions, storageBytes] = await Promise.all([
    eventType === 'cloud_cycle_saved' ? countPremiumSubscriptions() : Promise.resolve(undefined),
    eventType === 'cloud_cycle_saved' ? getCurrentStorageBytes() : Promise.resolve(undefined),
  ]);

  await db.runTransaction(async (transaction) => {
    const [dailySnapshot, deviceDedupeSnapshot, accountDedupeSnapshot, userMetricsSnapshot] = await Promise.all([
      transaction.get(dailyRef),
      deviceDedupeRef ? transaction.get(deviceDedupeRef) : Promise.resolve(null),
      accountDedupeRef ? transaction.get(accountDedupeRef) : Promise.resolve(null),
      userMetricsRef ? transaction.get(userMetricsRef) : Promise.resolve(null),
    ]);

    const incrementActiveDevices = Boolean(deviceDedupeRef && !deviceDedupeSnapshot?.exists);
    const incrementActiveAccounts = Boolean(accountDedupeRef && !accountDedupeSnapshot?.exists);
    const expiresAt = getDedupeExpiryDate();

    if (deviceDedupeRef && incrementActiveDevices) {
      transaction.set(deviceDedupeRef, {
        kind: 'device',
        dayKey,
        expiresAt,
        updatedAt: new Date(),
      });
    }

    if (accountDedupeRef && incrementActiveAccounts) {
      transaction.set(accountDedupeRef, {
        kind: 'account',
        dayKey,
        expiresAt,
        updatedAt: new Date(),
      });
    }

    transaction.set(
      dailyRef,
      buildNextAdminDailyMetrics({
        existingData: dailySnapshot.data() || {},
        eventType,
        storageBytes,
        premiumSubscriptions,
        incrementActiveDevices,
        incrementActiveAccounts,
      }),
      { merge: true }
    );

    if (!userMetricsRef || !uid) {
      return;
    }

    transaction.set(
      userMetricsRef,
      buildNextUserMetrics({
        uid,
        existingData: userMetricsSnapshot?.data() || {},
        eventType,
        dayKey,
      }),
      { merge: true }
    );
  });

  return true;
};

/** Records admin-only billing metric events that come from trusted Stripe webhooks. */
const recordBillingMetricEvent = async (eventType) => {
  const normalizedEventType = normalizeBillingMetricEventType(eventType);
  const db = getAdminDb();
  if (!db || !normalizedEventType) {
    return;
  }

  const dayKey = getDayKey();
  const dailyRef = db.collection('adminDailyMetrics').doc(dayKey);
  const premiumSubscriptions = await countPremiumSubscriptions();

  await db.runTransaction(async (transaction) => {
    const dailySnapshot = await transaction.get(dailyRef);
    transaction.set(
      dailyRef,
      buildNextAdminDailyMetrics({
        existingData: dailySnapshot.data() || {},
        eventType: normalizedEventType,
        premiumSubscriptions,
        incrementActiveDevices: false,
        incrementActiveAccounts: false,
      }),
      { merge: true }
    );
  });
};

/** Returns the admin-day keys for the requested window length. */
const createRequestedDayKeys = (windowSize) => {
  const keys = [];
  const cursor = new Date();
  for (let index = 0; index < windowSize; index += 1) {
    keys.unshift(getDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return keys;
};

/** Reads and normalizes all admin daily metrics for the requested window. */
const readAdminMetricsWindow = async (windowSize) => {
  const db = getAdminDb();
  if (!db) {
    return [];
  }

  const requestedKeys = new Set(createRequestedDayKeys(windowSize));
  const snapshot = await db.collection('adminDailyMetrics').get();

  return snapshot.docs
    .filter((docSnapshot) => requestedKeys.has(docSnapshot.id))
    .map((docSnapshot) => ({
      date: docSnapshot.id,
      ...getDefaultAdminDailyMetrics(),
      ...docSnapshot.data(),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
};

/** Builds the admin dashboard headline summary from the latest daily doc plus window totals. */
const createAdminMetricsSummary = (dailyMetrics, liveSummary = {}) => {
  const latestMetrics = dailyMetrics[dailyMetrics.length - 1] || getDefaultAdminDailyMetrics();

  const summary = dailyMetrics.reduce(
    (summary, dayMetrics) => ({
      activeDevices: latestMetrics.activeDevices,
      activeSignedInAccounts: latestMetrics.activeSignedInAccounts,
      premiumSubscriptions: latestMetrics.premiumSubscriptions,
      storageBytes: latestMetrics.storageBytes,
      signups: summary.signups + Number(dayMetrics.signups || 0),
      upgrades: summary.upgrades + Number(dayMetrics.upgrades || 0),
      cancellations: summary.cancellations + Number(dayMetrics.cancellations || 0),
      cloudSaves: summary.cloudSaves + Number(dayMetrics.cloudSaves || 0),
      cloudLoads: summary.cloudLoads + Number(dayMetrics.cloudLoads || 0),
    }),
    {
      activeDevices: latestMetrics.activeDevices,
      activeSignedInAccounts: latestMetrics.activeSignedInAccounts,
      premiumSubscriptions: latestMetrics.premiumSubscriptions,
      storageBytes: latestMetrics.storageBytes,
      signups: 0,
      upgrades: 0,
      cancellations: 0,
      cloudSaves: 0,
      cloudLoads: 0,
    }
  );

  return {
    ...summary,
    ...(typeof liveSummary.premiumSubscriptions === 'number'
      ? { premiumSubscriptions: liveSummary.premiumSubscriptions }
      : {}),
    ...(typeof liveSummary.storageBytes === 'number' ? { storageBytes: liveSummary.storageBytes } : {}),
  };
};

/** Handles client product-metric events while gracefully no-oping when hosted metrics are unavailable. */
const handleMetricEvent = async (req, res) => {
  if (!hasFirebaseAdminConfig()) {
    res.status(204).end();
    return;
  }

  const eventType = normalizeMetricEventType(req.body?.event);
  if (!eventType) {
    res.status(400).json({ error: 'Unsupported metrics event.' });
    return;
  }

  const installationId = readInstallationId(req.body?.installationId);
  const decodedToken = await verifyRequestUser(req);

  await recordMetricEvent({
    eventType,
    installationId,
    uid: decodedToken?.uid || null,
  });

  res.status(204).end();
};

/** Handles allowlisted admin metric reads for the private `/admin` dashboard. */
const handleAdminMetrics = async (req, res) => {
  if (!hasFirebaseAdminConfig()) {
    res.status(503).json({ error: 'Admin metrics are not configured on this deployment.' });
    return;
  }

  const decodedToken = await verifyRequestUser(req);
  if (!decodedToken) {
    res.status(401).json({ error: 'Missing or invalid Firebase ID token.' });
    return;
  }

  if (!isAllowedAdminUid(decodedToken.uid)) {
    res.status(403).json({ error: 'You are not authorized to view the admin dashboard.' });
    return;
  }

  const requestedWindow = Number.parseInt(String(req.query.window || '7'), 10);
  const windowSize = ADMIN_WINDOW_OPTIONS.has(requestedWindow) ? requestedWindow : 7;
  const [dailyMetrics, premiumSubscriptions, storageBytes] = await Promise.all([
    readAdminMetricsWindow(windowSize),
    countPremiumSubscriptions(),
    getCurrentStorageBytes(),
  ]);

  res.json({
    metricsEnabled: true,
    window: windowSize,
    summary: createAdminMetricsSummary(dailyMetrics, {
      premiumSubscriptions,
      storageBytes,
    }),
    dailyMetrics,
  });
};

/** Registers the product-metrics ingestion and private admin metrics endpoints on the hosted-service server. */
const registerMetricsRoutes = (app, express) => {
  app.post('/api/metrics/event', METRICS_RATE_LIMIT, express.json({ limit: '2kb' }), async (req, res) => {
    try {
      await handleMetricEvent(req, res);
    } catch (error) {
      console.error('[metrics] event:error', error);
      res.status(500).json({ error: 'Unable to record metrics right now.' });
    }
  });

  app.get('/api/admin/metrics', ADMIN_RATE_LIMIT, async (req, res) => {
    try {
      await handleAdminMetrics(req, res);
    } catch (error) {
      console.error('[metrics] admin:error', error);
      res.status(500).json({ error: 'Unable to read admin metrics right now.' });
    }
  });
};

module.exports = {
  recordBillingMetricEvent,
  registerMetricsRoutes,
};
