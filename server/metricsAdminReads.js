'use strict';

const { getAdminDb } = require('./firebase-admin');
const {
  getDayKey,
  getDefaultAdminDailyMetrics,
  getLatestAdminSummaryValues,
  accumulateAdminWindowTotals,
} = require('./metricsValues');

const ADMIN_WINDOW_OPTIONS = new Set([7, 30]);
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

/** Clears cached admin aggregation values so tests can reload with a fresh Firestore double. */
const resetAdminMetricsCachesForTests = () => {
  storageBytesCache = { value: null, expiresAt: 0 };
  premiumSubscriptionsCache = { value: null, expiresAt: 0 };
  totalAccountsCache = { value: null, expiresAt: 0 };
  pendingPremiumCount = null;
  pendingTotalAccounts = null;
};

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

/** Normalizes the raw admin window query value to a supported window size. */
const normalizeAdminWindowSize = (rawWindow) => {
  const requestedWindow = Number.parseInt(String(rawWindow || '7'), 10);
  return ADMIN_WINDOW_OPTIONS.has(requestedWindow) ? requestedWindow : 7;
};

/** Reads every live admin aggregation for the dashboard in one parallel batch. */
const getAdminMetricsSnapshot = async (rawWindow) => {
  const windowSize = normalizeAdminWindowSize(rawWindow);
  const [dailyMetrics, premiumSubscriptions, storageBytes, totalAccounts] = await Promise.all([
    readAdminMetricsWindow(windowSize),
    countPremiumSubscriptions(),
    getCurrentStorageBytes(),
    countTotalAccounts(),
  ]);

  return {
    window: windowSize,
    summary: createAdminMetricsSummary(dailyMetrics, {
      totalAccounts,
      premiumSubscriptions,
      storageBytes,
    }),
    dailyMetrics,
  };
};

module.exports = {
  ADMIN_WINDOW_OPTIONS,
  STORAGE_COLLECTIONS,
  STORAGE_CACHE_TTL_MS,
  STORAGE_SCAN_LIMIT,
  PREMIUM_CACHE_TTL_MS,
  ESTIMATED_BYTES_PER_DOC,
  ESTIMATED_CLOUD_CYCLE_METADATA_BYTES,
  countCollectionDocuments,
  countPremiumSubscriptions,
  countTotalAccounts,
  createAdminMetricsSummary,
  createRequestedDayKeys,
  getAdminMetricsSnapshot,
  getCurrentStorageBytes,
  normalizeAdminWindowSize,
  readAdminMetricsWindow,
  readCloudCyclePayloadBytes,
  resetAdminMetricsCachesForTests,
};
