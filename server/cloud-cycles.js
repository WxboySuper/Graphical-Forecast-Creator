'use strict';

const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const MAX_CLOUD_CYCLES = 100;
const MAX_PAYLOAD_BYTES = 750000;
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_METADATA_TEXT_LENGTH = 256;
const MAX_METADATA_COUNT = 10000;
const ALLOWED_METADATA_KEYS = new Set([
  'id', 'userId', 'label', 'cycleDate', 'createdAt', 'updatedAt',
  'forecastDays', 'totalOutlooks', 'totalFeatures', 'isReadOnly', 'payloadHash',
  'workflowMetadata',
]);

const verifyUser = async (req) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  const auth = getAdminAuth();
  if (!auth || !token) return null;
  try { return await auth.verifyIdToken(token); } catch { return null; }
};

const hasValidCycleIdentity = ({ userId, id, label }, uid) => userId === uid && typeof id === 'string' && id.length <= 128 && typeof label === 'string' && label.length > 0 && label.length <= 200;
const getPayloadBytes = (payloadJson) => Buffer.byteLength(payloadJson, 'utf8');
const hasValidCyclePayload = ({ cycleDate, payloadJson }) => {
  const bytes = typeof payloadJson === 'string' ? getPayloadBytes(payloadJson) : -1;
  return typeof cycleDate === 'string' && cycleDate.length <= 32 && typeof payloadJson === 'string' && bytes <= MAX_PAYLOAD_BYTES;
};
const normalizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const keys = Object.keys(metadata);
  if (keys.some((key) => !ALLOWED_METADATA_KEYS.has(key))) return null;

  let serializedBytes;
  try {
    serializedBytes = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
  } catch {
    return null;
  }
  if (serializedBytes > MAX_METADATA_BYTES) return null;

  for (const [key, value] of Object.entries(metadata)) {
    if (['id', 'userId', 'label', 'cycleDate', 'createdAt', 'updatedAt', 'payloadHash'].includes(key)) {
      if (typeof value !== 'string' || value.length > MAX_METADATA_TEXT_LENGTH) return null;
    } else if (['forecastDays', 'totalOutlooks', 'totalFeatures'].includes(key)) {
      if (!Number.isInteger(value) || value < 0 || value > MAX_METADATA_COUNT) return null;
    } else if (key === 'isReadOnly') {
      if (typeof value !== 'boolean') return null;
    } else if (key === 'workflowMetadata') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    }
  }

  return Object.fromEntries(keys.map((key) => [key, metadata[key]]));
};
const readCloudCycleRequest = (body, uid) => {
  const { id, userId, label, cycleDate, payloadJson, metadata } = body || {};
  if (!hasValidCycleIdentity({ userId, id, label }, uid)) return null;
  if (!hasValidCyclePayload({ cycleDate, payloadJson })) return null;
  const normalizedMetadata = normalizeMetadata(metadata);
  if (!normalizedMetadata) return null;
  return { id, label, cycleDate, payloadJson, payloadBytes: getPayloadBytes(payloadJson), metadata: normalizedMetadata };
};

const saveCloudCycle = async (db, uid, cycle) => {
  const cycleRef = db.collection('cloudCycles').doc(cycle.id);
  const payloadRef = cycleRef.collection('payload').doc('payload');
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(cycleRef);
    if (!existing.exists) {
      // The quota is hard-capped at MAX_CLOUD_CYCLES, so never read an
      // unbounded set of unrelated metadata documents during one save.
      const count = await transaction.get(
        db.collection('cloudCycles').where('userId', '==', uid).limit(MAX_CLOUD_CYCLES + 1)
      );
      if (count.size >= MAX_CLOUD_CYCLES) throw Object.assign(new Error('CLOUD_QUOTA_EXCEEDED'), { code: 'CLOUD_QUOTA_EXCEEDED' });
    }
    transaction.set(cycleRef, { ...cycle.metadata, id: cycle.id, userId: uid, label: cycle.label, cycleDate: cycle.cycleDate, payloadBytes: cycle.payloadBytes });
    transaction.set(payloadRef, { payloadJson: cycle.payloadJson, payloadBytes: cycle.payloadBytes });
  });
};

const handleCloudCycleSave = async (req, res) => {
  if (!hasFirebaseAdminConfig()) return res.status(503).json({ error: 'Cloud storage is unavailable.' });
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  const db = getAdminDb();
  const entitlement = await db.collection('userEntitlements').doc(user.uid).get();
  if (entitlement.data()?.premiumActive !== true) return res.status(403).json({ error: 'Premium cloud storage is required.' });
  const cycle = readCloudCycleRequest(req.body, user.uid);
  if (!cycle) return res.status(400).json({ error: 'Invalid cloud cycle payload.' });
  await saveCloudCycle(db, user.uid, cycle);
  return res.status(200).json({ success: true, data: cycle.id });
};

const registerCloudCycleRoutes = (app, express, rateLimit) => {
  const saveRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.post('/api/cloud-cycles', saveRateLimit, express.json({ limit: '800kb' }), async (req, res) => {
    try {
      return await handleCloudCycleSave(req, res);
    } catch (error) {
      if (error?.code === 'CLOUD_QUOTA_EXCEEDED' || error?.message === 'CLOUD_QUOTA_EXCEEDED') return res.status(409).json({ error: 'Cloud storage quota reached.' });
      console.error('[cloud-cycles] save:error', error);
      return res.status(500).json({ error: 'Unable to save cloud cycle.' });
    }
  });
};

module.exports = {
  MAX_CLOUD_CYCLES,
  getPayloadBytes,
  readCloudCycleRequest,
  registerCloudCycleRoutes,
  saveCloudCycle,
};
