'use strict';

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
const ADMIN_WINDOW_OPTIONS = new Set([7, 30]);
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
const STORAGE_COLLECTIONS = [
  'cloudCycles',
  'userProfiles',
  'userSettings',
  'userEntitlements',
  'userMetrics',
  'adminDailyMetrics',
  'adminMetricDedupes',
];
const STORAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const STORAGE_SCAN_LIMIT = 1001;
let storageBytesCache = {
  value: null,
  expiresAt: 0,
};
const PREMIUM_CACHE_TTL_MS = 5 * 60 * 1000;
let premiumSubscriptionsCache = {
  value: null,
  expiresAt: 0,
};
let pendingPremiumCount = null;
let totalAccountsCache = { value: null, expiresAt: 0 };
let pendingTotalAccounts = null;

/** Returns true when the premium subscriptions cache has a fresh value. */
const hasFreshPremiumCache = () =>
  premiumSubscriptionsCache.value !== null && Date.now() < premiumSubscriptionsCache.expiresAt;

/** Stores a premium subscription count in the cache with a TTL. */
const cachePremiumSubscriptions = (value) => {
  premiumSubscriptionsCache = {
    value,
    expiresAt: Date.now() + PREMIUM_CACHE_TTL_MS,
  };
};

/** True when the storage-footprint cache is still valid for reuse. */
const hasFreshStorageCache = () =>
  storageBytesCache.value !== null && Date.now() < storageBytesCache.expiresAt;

/** Returns the cached storage byte estimate, or null when a refresh is needed. */
const readCachedStorageBytes = () => (hasFreshStorageCache() ? storageBytesCache.value : null);

/** Persists one freshly computed storage byte estimate into the short-lived cache. */
const cacheStorageBytes = (value) => {
  storageBytesCache = {
    value,
    expiresAt: Date.now() + STORAGE_CACHE_TTL_MS,
  };
};

const {
  getDayKey, normalizeMetricEventType, normalizeBillingMetricEventType, readInstallationId,
  hashInstallationId, createDedupeDocId, getDedupeExpiryDate,
  getDefaultAdminDailyMetrics, buildNextUserMetrics, buildNextAdminDailyMetrics,
  getLatestAdminSummaryValues, accumulateAdminWindowTotals,
} = require('./metricsValues');

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
const readPremiumSubscriptionCount = async (db) => {
  const query = db
    .collection('userEntitlements')
    .where('billingStatus', 'in', ['active', 'trialing']);

  if (typeof query.count === 'function') {
    try {
      const snapshot = await query.count().get();
      const count = snapshot.data?.()?.count;
      if (typeof count === 'number') return count;
    } catch {
      // Fall through to the filtered document count when aggregation is unavailable.
    }
  }

  const fallbackSnapshot = await query.get();
  return fallbackSnapshot.size;
};

/** Returns the cached or in-flight premium subscription count, refreshing it when expired. */
const countPremiumSubscriptions = () => {
  const db = getAdminDb();
  if (!db) {
    return 0;
  }

  if (hasFreshPremiumCache()) {
    return premiumSubscriptionsCache.value;
  }

  if (pendingPremiumCount) {
    return pendingPremiumCount;
  }

  pendingPremiumCount = readPremiumSubscriptionCount(db)
    .then((count) => {
      cachePremiumSubscriptions(count);
      pendingPremiumCount = null;
      return count;
    })
    .catch((err) => {
      pendingPremiumCount = null;
      throw err;
    });

  return pendingPremiumCount;
};

/** Returns the current total number of hosted accounts that have profile docs in Firestore. */
const readTotalAccounts = async (db) => {
  try {
    const snapshot = await db.collection('userProfiles').count().get();
    const count = snapshot.data?.()?.count;
    if (typeof count === 'number') {
      return count;
    }
  } catch {
    // Fall through to the bounded scan when aggregate support is unavailable.
  }

  return countCollectionDocuments(db, 'userProfiles');
};

/** Returns the cached or freshly aggregated total account count. */
const countTotalAccounts = () => {
  const db = getAdminDb();
  if (!db) {
    return Promise.resolve(0);
  }

  if (typeof totalAccountsCache.value === 'number' && Date.now() < totalAccountsCache.expiresAt) {
    return totalAccountsCache.value;
  }
  if (pendingTotalAccounts) return pendingTotalAccounts;

  pendingTotalAccounts = readTotalAccounts(db).then((count) => {
    totalAccountsCache = { value: count, expiresAt: Date.now() + STORAGE_CACHE_TTL_MS };
    return count;
  }).finally(() => {
    pendingTotalAccounts = null;
  });

  return pendingTotalAccounts;
};

/** Average per-document overhead (id + path + metadata) used for storage estimates. */
const ESTIMATED_BYTES_PER_DOC = 256;

/** Estimated bytes contributed by one cloud-cycle metadata document (payload excluded). */
const ESTIMATED_CLOUD_CYCLE_METADATA_BYTES = 512;

/**
 * Reads a bounded count for one collection without transferring documents.
 * Falls back to a capped scan when the emulator or test double lacks aggregate support.
 */
async function countCollectionDocuments(db, collectionName) {
  try {
    const snapshot = await db.collection(collectionName).count().get();
    return typeof snapshot.data?.()?.count === 'number' ? snapshot.data().count : 0;
  } catch (error) {
    console.error(`Storage metrics: aggregate count unavailable for "${collectionName}", using capped fallback.`, error);
    if (!db.collection(collectionName).limit) {
      return 0;
    }
    const capped = await db.collection(collectionName).limit(STORAGE_SCAN_LIMIT).get();
    const docs = capped.docs || [];
    return docs.length === STORAGE_SCAN_LIMIT ? STORAGE_SCAN_LIMIT : docs.length;
  }
}

/** Reads the bounded sum of cloud-cycle payload bytes without transferring documents. */
const readCloudCyclePayloadBytes = async (db) => {
  try {
    const snapshot = await db.collection('cloudCycles').aggregate({ payloadBytes: 'sum' }).get();
    const total = snapshot.data?.()?.payloadBytes;
    return typeof total === 'number' && total > 0 ? total : 0;
  } catch (error) {
    console.error('Storage metrics: aggregate payload-byte sum unavailable, using capped fallback.', error);
    return sumCappedPayloadBytes(db);
  }
};

/** Sums payloadBytes from a capped scan when the emulator or test double lacks aggregate support. */
async function sumCappedPayloadBytes(db) {
  if (!db.collection('cloudCycles').limit) {
    return 0;
  }
  const capped = await db.collection('cloudCycles').limit(STORAGE_SCAN_LIMIT).get();
  const docs = capped.docs || [];
  return docs.reduce(
    (total, docSnapshot) => total + (Number(docSnapshot.data?.()?.payloadBytes) || 0),
    0
  );
}

/** Estimates the current hosted Firestore storage footprint using bounded server-side aggregation. */
const getCurrentStorageBytes = async () => {
  const db = getAdminDb();
  if (!db) {
    return 0;
  }

  const cachedValue = readCachedStorageBytes();
  if (typeof cachedValue === 'number') {
    return cachedValue;
  }

  const collectionCounts = await Promise.all(
    STORAGE_COLLECTIONS.map(async (collectionName) => ({
      name: collectionName,
      count: await countCollectionDocuments(db, collectionName),
    }))
  );
  const nonPayloadBytes = collectionCounts.reduce(
    (total, { name, count }) =>
      total +
      count *
        (name === 'cloudCycles' ? ESTIMATED_CLOUD_CYCLE_METADATA_BYTES : ESTIMATED_BYTES_PER_DOC),
    0
  );
  const cloudCyclePayloadBytes = await readCloudCyclePayloadBytes(db);
  const totalBytes = nonPayloadBytes + cloudCyclePayloadBytes;

  cacheStorageBytes(totalBytes);

  return totalBytes;
};

/** Builds the Firestore refs needed to record one metric event. */
const createMetricEventRefs = ({ db, dayKey, installationId, uid }) => {
  const installationHash = installationId ? hashInstallationId(installationId) : null;

  return {
    dailyRef: db.collection('adminDailyMetrics').doc(dayKey),
    deviceDedupeRef: installationHash
      ? db.collection('adminMetricDedupes').doc(createDedupeDocId('device', dayKey, installationHash))
      : null,
    accountDedupeRef: uid
      ? db.collection('adminMetricDedupes').doc(createDedupeDocId('account', dayKey, uid))
      : null,
    userMetricsRef: uid ? db.collection('userMetrics').doc(uid) : null,
  };
};

/** Returns whether this event should refresh live admin headline totals. */
const shouldRefreshLiveAdminSummary = (eventType) => eventType === 'cloud_cycle_saved';

/** Loads optional live admin summary values needed for metric writes. */
const readLiveAdminSummary = async (eventType) => {
  if (!shouldRefreshLiveAdminSummary(eventType)) {
    return {
      premiumSubscriptions: undefined,
      storageBytes: undefined,
    };
  }

  const [premiumSubscriptions, storageBytes] = await Promise.all([
    countPremiumSubscriptions(),
    getCurrentStorageBytes(),
  ]);

  return {
    premiumSubscriptions,
    storageBytes,
  };
};

/** Reads the current metric event transaction snapshots in one parallel batch. */
const readMetricEventSnapshots = (transaction, {
  dailyRef,
  deviceDedupeRef,
  accountDedupeRef,
  userMetricsRef,
}) =>
  Promise.all([
    transaction.get(dailyRef),
    deviceDedupeRef ? transaction.get(deviceDedupeRef) : Promise.resolve(null),
    accountDedupeRef ? transaction.get(accountDedupeRef) : Promise.resolve(null),
    userMetricsRef ? transaction.get(userMetricsRef) : Promise.resolve(null),
  ]);

/** Writes newly won device/account dedupe docs for the current day. */
const writeMetricDedupeDocs = ({
  transaction,
  deviceDedupeRef,
  accountDedupeRef,
  incrementActiveDevices,
  incrementActiveAccounts,
  dayKey,
  expiresAt,
  uid,
}) => {
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
      uid,
      dayKey,
      expiresAt,
      updatedAt: new Date(),
    });
  }
};

/** Writes the next admin daily aggregate document for the current event. */
const writeAdminDailyMetrics = ({
  transaction,
  dailyRef,
  dailySnapshot,
  eventType,
  storageBytes,
  premiumSubscriptions,
  incrementActiveDevices,
  incrementActiveAccounts,
}) => {
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
};

/** Writes the next signed-in user metrics document when the event is tied to an account. */
const writeUserMetrics = ({
  transaction,
  userMetricsRef,
  uid,
  userMetricsSnapshot,
  eventType,
  dayKey,
}) => {
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
};

/** Runs the Firestore transaction that persists one product metric event. */
const writeMetricEventTransaction = async ({
  db,
  refs,
  eventType,
  uid,
  dayKey,
  premiumSubscriptions,
  storageBytes,
}) => {
  await db.runTransaction(async (transaction) => {
    const [dailySnapshot, deviceDedupeSnapshot, accountDedupeSnapshot, userMetricsSnapshot] =
      await readMetricEventSnapshots(transaction, refs);

    const incrementActiveDevices = Boolean(refs.deviceDedupeRef && !deviceDedupeSnapshot?.exists);
    const incrementActiveAccounts = Boolean(refs.accountDedupeRef && !accountDedupeSnapshot?.exists);
    const expiresAt = getDedupeExpiryDate();

    writeMetricDedupeDocs({
      transaction,
      deviceDedupeRef: refs.deviceDedupeRef,
      accountDedupeRef: refs.accountDedupeRef,
      incrementActiveDevices,
      incrementActiveAccounts,
      dayKey,
      expiresAt,
      uid,
    });

    writeAdminDailyMetrics({
      transaction,
      dailyRef: refs.dailyRef,
      dailySnapshot,
      eventType,
      storageBytes,
      premiumSubscriptions,
      incrementActiveDevices,
      incrementActiveAccounts,
    });

    writeUserMetrics({
      transaction,
      userMetricsRef: refs.userMetricsRef,
      uid,
      userMetricsSnapshot,
      eventType,
      dayKey,
    });
  });
};

/** Writes one product metric event into Firestore-backed user and admin aggregates. */
const recordMetricEvent = async ({ eventType, installationId, uid }) => {
  const db = getAdminDb();
  if (!db || !eventType) {
    return false;
  }

  const dayKey = getDayKey();
  const refs = createMetricEventRefs({
    db,
    dayKey,
    installationId,
    uid,
  });
  const { premiumSubscriptions, storageBytes } = await readLiveAdminSummary(eventType);
  await writeMetricEventTransaction({
    db,
    refs,
    eventType,
    uid,
    dayKey,
    premiumSubscriptions,
    storageBytes,
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

  const requestedKeys = createRequestedDayKeys(windowSize);
  const refs = requestedKeys.map((dayKey) => db.collection('adminDailyMetrics').doc(dayKey));
  const snapshots = refs.length ? await db.getAll(...refs) : [];

  return snapshots
    .filter((docSnapshot) => docSnapshot.exists)
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
  const baseSummary = getLatestAdminSummaryValues(latestMetrics, liveSummary);
  const windowTotals = dailyMetrics.reduce(
    accumulateAdminWindowTotals,
    {
      signups: 0,
      signIns: 0,
      upgrades: 0,
      cancellations: 0,
      cloudSaves: 0,
      cloudLoads: 0,
    }
  );

  return {
    ...(typeof liveSummary.totalAccounts === 'number' ? { totalAccounts: liveSummary.totalAccounts } : {}),
    ...baseSummary,
    ...windowTotals,
    ...(typeof liveSummary.premiumSubscriptions === 'number'
      ? { premiumSubscriptions: liveSummary.premiumSubscriptions }
      : {}),
    ...(typeof liveSummary.storageBytes === 'number' ? { storageBytes: liveSummary.storageBytes } : {}),
  };
};

/** Returns true when a metric event would write trusted admin or account data. */
const requiresAuthenticatedMetricEvent = (eventType) => METRIC_EVENT_TYPES.has(eventType);

/** Rejects metric events without a verified Firebase identity. */
const requireAuthForMetricEvent = (eventType, decodedToken, res) => {
  if (requiresAuthenticatedMetricEvent(eventType) && !decodedToken) {
    console.warn(`[metrics] ${eventType}:unauthenticated`);
    res.status(401).json({ error: 'Authentication required for product metrics.' });
    return true;
  }
  return false;
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

  if (requireAuthForMetricEvent(eventType, decodedToken, res)) return;

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
    console.warn('[metrics] admin:unauthenticated');
    res.status(401).json({ error: 'Missing or invalid Firebase ID token.' });
    return;
  }

  if (!isAllowedAdminUid(decodedToken.uid)) {
    console.warn('[metrics] admin:forbidden', {
      uid: decodedToken.uid,
      allowlistSize: getAdminUidAllowlist().length,
    });
    res.status(403).json({ error: 'You are not authorized to view the admin dashboard.' });
    return;
  }

  const requestedWindow = Number.parseInt(String(req.query.window || '7'), 10);
  const windowSize = ADMIN_WINDOW_OPTIONS.has(requestedWindow) ? requestedWindow : 7;
  const [dailyMetrics, premiumSubscriptions, storageBytes, totalAccounts] = await Promise.all([
    readAdminMetricsWindow(windowSize),
    countPremiumSubscriptions(),
    getCurrentStorageBytes(),
    countTotalAccounts(),
  ]);

  res.json({
    metricsEnabled: true,
    window: windowSize,
    summary: createAdminMetricsSummary(dailyMetrics, {
      totalAccounts,
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
  handleMetricEvent,
  recordBillingMetricEvent,
  registerMetricsRoutes,
  countCollectionDocuments,
  countPremiumSubscriptions,
  countTotalAccounts,
  readCloudCyclePayloadBytes,
  getCurrentStorageBytes,
  requiresAuthenticatedMetricEvent,
};
