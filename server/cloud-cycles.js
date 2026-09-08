/**
 * Exposes authenticated server handlers for saving, listing, and deleting cloud forecast cycles.
 * This module owns request validation and Firebase boundary coordination; metadata normalization and token verification are delegated to shared helpers.
 */
'use strict';

const { getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const { verifyFirebaseToken } = require('./firebase-auth');
const { normalizeMetadata } = require('./cloud-cycle-metadata');
const MAX_CLOUD_CYCLES = 100;
const MAX_PAYLOAD_BYTES = 750000;

/** Returns the Firebase user for an authenticated cloud-cycle request. */
const verifyUser = (req) => {
  return verifyFirebaseToken(req);
};

/** Validates that a cloud-cycle identity belongs to the verified user. */
const hasValidCycleIdentity = ({ userId, id, label }, uid) => userId === uid && typeof id === 'string' && id.length <= 128 && typeof label === 'string' && label.length > 0 && label.length <= 200;
/** Returns the UTF-8 byte length of a serialized cloud-cycle payload. */
const getPayloadBytes = (payloadJson) => Buffer.byteLength(payloadJson, 'utf8');
/** Validates the bounded payload fields accepted by the cloud-cycle API. */
const hasValidCyclePayload = ({ cycleDate, payloadJson }) => {
  const bytes = typeof payloadJson === 'string' ? getPayloadBytes(payloadJson) : -1;
  return typeof cycleDate === 'string' && cycleDate.length <= 32 && typeof payloadJson === 'string' && bytes <= MAX_PAYLOAD_BYTES;
};
/** Reads and normalizes a cloud-cycle request body for persistence. */
const readCloudCycleRequest = (body, uid) => {
  const { id, userId, label, cycleDate, payloadJson, metadata } = body || {};
  if (!hasValidCycleIdentity({ userId, id, label }, uid)) return null;
  if (!hasValidCyclePayload({ cycleDate, payloadJson })) return null;
  const normalizedMetadata = normalizeMetadata(metadata);
  if (!normalizedMetadata) return null;
  return { id, label, cycleDate, payloadJson, payloadBytes: getPayloadBytes(payloadJson), metadata: normalizedMetadata };
};

/** Persists a cloud cycle and its payload atomically. */
const saveCloudCycle = async (db, uid, cycle) => {
  const cycleRef = db.collection('cloudCycles').doc(cycle.id);
  const payloadRef = cycleRef.collection('payload').doc('payload');
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(cycleRef);
    if (existing.exists && existing.data()?.userId !== uid) {
      throw Object.assign(new Error('CLOUD_CYCLE_OWNERSHIP_CONFLICT'), {
        code: 'CLOUD_CYCLE_OWNERSHIP_CONFLICT',
      });
    }
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

/** Handles a validated cloud-cycle save request. */
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

/** Sends the stable public response for a cloud-cycle save failure. */
const sendCloudCycleSaveError = (res, error) => {
  if (error?.code === 'CLOUD_QUOTA_EXCEEDED' || error?.message === 'CLOUD_QUOTA_EXCEEDED') {
    return res.status(409).json({ error: 'Cloud storage quota reached.' });
  }
  if (error?.code === 'CLOUD_CYCLE_OWNERSHIP_CONFLICT' || error?.message === 'CLOUD_CYCLE_OWNERSHIP_CONFLICT') {
    return res.status(409).json({ error: 'Cloud cycle belongs to another account.' });
  }
  console.error('[cloud-cycles] save:error', error);
  return res.status(500).json({ error: 'Unable to save cloud cycle.' });
};

/** Registers the cloud-cycle API routes on the application. */
const registerCloudCycleRoutes = (app, express, rateLimit) => {
  const saveRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.post('/api/cloud-cycles', saveRateLimit, express.json({ limit: '800kb' }), async (req, res) => {
    try {
      return await handleCloudCycleSave(req, res);
    } catch (error) {
      return sendCloudCycleSaveError(res, error);
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
