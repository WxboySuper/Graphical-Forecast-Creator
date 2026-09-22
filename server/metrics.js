'use strict';

const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const { registerMetricsRoutes: registerMetricsRoutesImpl } = require('./metricsRoutes');
const {
  getDayKey, normalizeMetricEventType, normalizeBillingMetricEventType, readInstallationId,
  hashInstallationId, createDedupeDocId, getDedupeExpiryDate,
  buildNextUserMetrics, buildNextAdminDailyMetrics,
} = require('./metricsValues');
const {
  countCollectionDocuments,
  countPremiumSubscriptions,
  countTotalAccounts,
  getAdminMetricsSnapshot,
  getCurrentStorageBytes,
  readCloudCyclePayloadBytes,
} = require('./metricsAdminReads');

const METRIC_EVENT_TYPES = new Set([
  'account_signup',
  'account_signin',
  'cycle_saved',
  'discussion_saved',
  'verification_run',
  'cloud_cycle_saved',
  'cloud_cycle_loaded',
]);

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

  const snapshot = await getAdminMetricsSnapshot(req.query.window);

  res.json({
    metricsEnabled: true,
    ...snapshot,
  });
};

/** Registers the product-metrics ingestion and private admin metrics endpoints on the hosted-service server. */
const registerMetricsRoutes = (app, express) => {
  registerMetricsRoutesImpl({
    app,
    express,
    handleMetricEvent,
    handleAdminMetrics,
  });
};

module.exports = {
  handleAdminMetrics,
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
