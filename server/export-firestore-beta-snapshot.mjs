import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { Bytes, DocumentReference, FieldPath, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const serializeFirestoreValue = (value) => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof GeoPoint) {
    return { __type: 'geoPoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof DocumentReference) return { __type: 'documentReference', path: value.path };
  if (value instanceof Bytes) return { __type: 'bytes', base64: value.toBase64() };
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestoreValue(child)]));
  }
  return value;
};

function validateCycleMetadata(metadata, cycleId, uid, malformedLegacyCycles) {
  const label = normalizeCycleLabel(metadata?.label, cycleId, uid, malformedLegacyCycles);
  const cycleDate = normalizeCycleDate(metadata?.cycleDate, cycleId, uid, malformedLegacyCycles);
  return { label, cycleDate };
}

function normalizeCycleLabel(value, cycleId, uid, malformedLegacyCycles) {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label || label.length > 200) throwInvalidCycleMetadata(cycleId, uid, malformedLegacyCycles);
  return label;
}

function normalizeCycleDate(value, cycleId, uid, malformedLegacyCycles) {
  const cycleDate = typeof value === 'string' ? value : '';
  if (!cycleDate || cycleDate.length > 32) throwInvalidCycleMetadata(cycleId, uid, malformedLegacyCycles);
  return cycleDate;
}

function throwInvalidCycleMetadata(cycleId, uid, malformedLegacyCycles) {
  malformedLegacyCycles.push({ uidHash: sha256(uid), cycleHash: sha256(cycleId) });
  throw new Error(`Invalid cycle label or date for account hash ${sha256(uid)} cycle hash ${sha256(cycleId)}.`);
}

const isLegacyCycleCollection = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isValidLegacyCycle = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && (value.metadata === undefined || (Boolean(value.metadata) && typeof value.metadata === 'object' && !Array.isArray(value.metadata)));

function parseLegacyCloudCycles(legacyValue, uid, malformedLegacyCycles) {
  if (legacyValue === undefined || legacyValue === null) return null;
  let legacy = legacyValue;
  if (typeof legacyValue === 'string') {
    try { legacy = JSON.parse(legacyValue); }
    catch { throw new Error(`Unparseable legacy cloudCycles for account hash ${sha256(uid)}.`); }
  }
  if (!isLegacyCycleCollection(legacy)) {
    malformedLegacyCycles.push({ uidHash: sha256(uid), cycleHash: sha256('cloudCycles') });
    throw new Error(`Malformed legacy cloudCycles for account hash ${sha256(uid)}.`);
  }
  return legacy;
}

function normalizeLegacyCloudCycle(id, raw, uid, malformedLegacyCycles) {
  assertLegacyCycle(raw, id, uid, malformedLegacyCycles);
  const metadata = raw.metadata ?? raw;
  const { label, cycleDate } = validateCycleMetadata(metadata, id, uid, malformedLegacyCycles);
  const payloadJson = normalizeLegacyCyclePayload(raw.payloadJson ?? raw.payload, id, uid, malformedLegacyCycles);
  return {
    id, label, cycleDate, metadata, payloadJson, payloadBytes: Buffer.byteLength(payloadJson),
    createdAt: metadata.createdAt || new Date(0).toISOString(),
    updatedAt: metadata.updatedAt || metadata.createdAt || new Date(0).toISOString(),
  };
}

function assertLegacyCycle(raw, id, uid, malformedLegacyCycles) {
  if (isValidLegacyCycle(raw)) return;
  malformedLegacyCycles.push({ uidHash: sha256(uid), cycleHash: sha256(id) });
  throw new Error(`Malformed legacy cycle for account hash ${sha256(uid)} cycle hash ${sha256(id)}.`);
}

function normalizeLegacyCyclePayload(rawPayload, id, uid, malformedLegacyCycles) {
  if (typeof rawPayload !== 'string') {
    return rawPayload !== null && rawPayload !== undefined ? JSON.stringify(rawPayload) : '{}';
  }
  try { JSON.parse(rawPayload); }
  catch {
    malformedLegacyCycles.push({ uidHash: sha256(uid), cycleHash: sha256(id) });
    throw new Error(`Invalid legacy cycle payload for account hash ${sha256(uid)} cycle hash ${sha256(id)}.`);
  }
  return rawPayload;
}

function readLegacyCloudCycles(account, malformedLegacyCycles) {
  const cycles = parseLegacyCloudCycles(account.userSettings?.cloudCycles, account.uid, malformedLegacyCycles);
  if (!cycles) return;
  for (const [id, raw] of Object.entries(cycles)) {
    account.cloudCycles.push(normalizeLegacyCloudCycle(id, raw, account.uid, malformedLegacyCycles));
  }
}

function readCyclePayloadValue(payloadDoc, metadata) {
  return payloadDoc.exists ? payloadDoc.data()?.payloadJson : metadata.payloadJson;
}

function validateMigratedCyclePayload(payloadValue, uid, cycleId) {
  const payloadJson = typeof payloadValue === 'string' ? payloadValue
    : payloadValue !== null && payloadValue !== undefined ? JSON.stringify(payloadValue) : null;
  if (typeof payloadJson !== 'string') {
    throw new Error(`Missing cycle payload for account hash ${sha256(uid)} cycle hash ${sha256(cycleId)}.`);
  }
  try { JSON.parse(payloadJson); }
  catch { throw new Error(`Invalid cycle payload for account hash ${sha256(uid)} cycle hash ${sha256(cycleId)}.`); }
  return payloadJson;
}

function normalizeCloudCycleDocument(cycleDoc, payloadDoc, account, malformedLegacyCycles) {
  const metadata = cycleDoc.data();
  const { label, cycleDate } = validateCycleMetadata(metadata, cycleDoc.id, account.uid, malformedLegacyCycles);
  const payloadJson = validateMigratedCyclePayload(readCyclePayloadValue(payloadDoc, metadata), account.uid, cycleDoc.id);
  return {
    id: cycleDoc.id, label, cycleDate, metadata, payloadJson, payloadBytes: Buffer.byteLength(payloadJson),
    createdAt: normalizeFirestoreTimestamp(metadata.createdAt),
    updatedAt: normalizeFirestoreTimestamp(metadata.updatedAt),
  };
}

function normalizeFirestoreTimestamp(value) {
  return value?.toDate?.()?.toISOString?.() || value || new Date(0).toISOString();
}

async function readCloudCyclePage(account, cycleDocs, malformedLegacyCycles) {
  const migratedCycles = [];
  for (let offset = 0; offset < cycleDocs.length; offset += 10) {
    const cycleBatch = cycleDocs.slice(offset, offset + 10);
    const payloadDocs = await Promise.all(cycleBatch.map((cycleDoc) => cycleDoc.ref.collection('payload').doc('payload').get()));
    for (const [index, cycleDoc] of cycleBatch.entries()) migratedCycles.push(
      normalizeCloudCycleDocument(cycleDoc, payloadDocs[index], account, malformedLegacyCycles),
    );
  }
  return migratedCycles;
}

function mergeMigratedCloudCycles(account, migratedCycles) {
  const legacyCycleIndexes = new Map(account.cloudCycles.map((cycle, index) => [cycle.id, index]));
  for (const cycle of migratedCycles) {
    const legacyIndex = legacyCycleIndexes.get(cycle.id);
    if (legacyIndex === undefined) {
      legacyCycleIndexes.set(cycle.id, account.cloudCycles.length);
      account.cloudCycles.push(cycle);
    } else account.cloudCycles[legacyIndex] = cycle;
  }
}

const readArguments = () => {
  const args = process.argv.slice(2);
  const outputAt = args.indexOf('--output');
  return { output: outputAt >= 0 ? args[outputAt + 1] : '' };
};

async function exportChildCollections(page, exportCollection) {
  const childLists = await Promise.all(page.map((document) => document.ref.listCollections()));
  const children = childLists.flat();
  for (let offset = 0; offset < children.length; offset += 10) {
    const results = await Promise.allSettled(children.slice(offset, offset + 10).map(exportCollection));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
}

async function exportSnapshotPage(page, writeSnapshotLine, exportCollection) {
  await Promise.all(page.map((document) => writeSnapshotLine({ path: document.ref.path, data: serializeFirestoreValue(document.data()) })));
  await exportChildCollections(page, exportCollection);
}

async function exportCollectionPages(collectionRef, writeSnapshotLine, exportCollection) {
  let cursor = null;
  let exportedCount = 0;
  while (true) {
    let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(500);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const collectionSnapshot = await pageQuery.get();
    for (let offset = 0; offset < collectionSnapshot.docs.length; offset += 10) {
      const page = collectionSnapshot.docs.slice(offset, offset + 10);
      await exportSnapshotPage(page, writeSnapshotLine, exportCollection);
      exportedCount += page.length;
    }
    if (collectionSnapshot.docs.length < 500) break;
    cursor = collectionSnapshot.docs.at(-1);
  }
  return exportedCount;
}

async function main() {
  const { output } = readArguments();
  if (!output) throw new Error('Usage: node server/export-firestore-beta-snapshot.mjs --output <private-directory>');
  const projectId = required('FIREBASE_ADMIN_PROJECT_ID');
  const expectedBetaProjectId = required('BETA_FIREBASE_PROJECT_ID');
  if (projectId !== expectedBetaProjectId) throw new Error('Refusing export: FIREBASE_ADMIN_PROJECT_ID does not match BETA_FIREBASE_PROJECT_ID.');

  const app = getApps()[0] || initializeApp({
    credential: cert({
      projectId,
      clientEmail: required('FIREBASE_ADMIN_CLIENT_EMAIL'),
      privateKey: required('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
    }),
  });
  const db = getFirestore(app);
  await fs.mkdir(output, { recursive: false, mode: 0o700 });
  const fullSnapshotFile = await fs.open(path.join(output, 'full-snapshot.jsonl'), 'wx', 0o600);
  let fullSnapshotCount = 0;
  let snapshotWriteError = null;
  let snapshotWriteQueue = Promise.resolve();
  const writeSnapshotLine = (record) => {
    snapshotWriteQueue = snapshotWriteQueue.catch(() => undefined).then(async () => {
      if (snapshotWriteError) throw snapshotWriteError;
      try {
        await fullSnapshotFile.write(`${JSON.stringify(record)}\n`);
      } catch (error) {
        snapshotWriteError = error;
        throw error;
      }
    });
    return snapshotWriteQueue;
  };
  const exportCollection = async (collectionRef) => {
    fullSnapshotCount += await exportCollectionPages(collectionRef, writeSnapshotLine, exportCollection);
  };
  const forEachDocumentPage = async (query, visitPage, { orderByDocumentId = true } = {}) => {
    let cursor = null;
    while (true) {
      // Firestore's default document-name order supports snapshot cursors without a composite index.
      let pageQuery = orderByDocumentId ? query.orderBy(FieldPath.documentId()) : query;
      pageQuery = pageQuery.limit(500);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const page = await pageQuery.get();
      await visitPage(page.docs);
      if (page.docs.length < 500) break;
      cursor = page.docs.at(-1);
    }
  };
  try {
    for (const collection of await db.listCollections()) await exportCollection(collection);
  } finally {
    try { await snapshotWriteQueue; }
    finally { await fullSnapshotFile.close(); }
  }

  const seenEmails = new Set();
  const userSnapshotDirectory = path.join(output, 'by-email');
  await fs.mkdir(userSnapshotDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(userSnapshotDirectory, 0o700);
  let count = 0;
  let skippedNoEmail = 0;
  const userSnapshotEmailHashes = [];
  const missingEmailHashes = [];
  const accountFailures = [];
  const malformedLegacyCycles = [];
  const migrateAccount = async (account) => {
    const [settingsDoc, entitlementDoc, metricsDoc] = await Promise.all([
      db.collection('userSettings').doc(account.uid).get(),
      db.collection('userEntitlements').doc(account.uid).get(),
      db.collection('userMetrics').doc(account.uid).get(),
    ]);
    if (settingsDoc.exists) account.userSettings = settingsDoc.data();
    if (entitlementDoc.exists) account.userEntitlement = entitlementDoc.data();
    if (metricsDoc.exists) account.userMetrics = metricsDoc.data();
    readLegacyCloudCycles(account, malformedLegacyCycles);
    const migratedCycles = [];
    await forEachDocumentPage(db.collection('cloudCycles').where('userId', '==', account.uid), async (cycleDocs) => {
      migratedCycles.push(...await readCloudCyclePage(account, cycleDocs, malformedLegacyCycles));
    }, { orderByDocumentId: false });
    mergeMigratedCloudCycles(account, migratedCycles);

    await Promise.all([
      forEachDocumentPage(db.collection('users').doc(account.uid).collection('workflowAwareness'), (page) => {
        account.workflowAwareness.push(...page.map((doc) => ({ id: doc.id, data: doc.data() })));
      }),
      forEachDocumentPage(db.collection('users').doc(account.uid).collection('customProducts'), (page) => {
        account.customProducts.push(...page.map((doc) => ({ id: doc.id, data: doc.data() })));
      }),
    ]);
    const key = `by-email/${sha256(account.email)}.json`;
    const outPath = path.join(output, key);
    await fs.mkdir(path.dirname(outPath), { recursive: true, mode: 0o700 });
    const json = JSON.stringify(serializeFirestoreValue(account));
    await fs.writeFile(outPath, json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    console.log(`${key} ${Buffer.byteLength(json)} bytes`);
    userSnapshotEmailHashes.push(sha256(account.email));
    count += 1;
  };

  let profileCursor = null;
  while (true) {
    let profileQuery = db.collection('userProfiles').orderBy(FieldPath.documentId()).limit(500);
    if (profileCursor) profileQuery = profileQuery.startAfter(profileCursor);
    const profilePage = await profileQuery.get();
    const pageAccounts = [];
    for (const profileDoc of profilePage.docs) {
      const profile = profileDoc.data();
      const email = normalizeEmail(profile.email);
      if (!email) {
        skippedNoEmail += 1;
        missingEmailHashes.push(sha256(profileDoc.id));
        console.warn(`Skipping beta user profile without an email (uid hash ${sha256(profileDoc.id)}).`);
        continue;
      }
      if (seenEmails.has(email)) {
        accountFailures.push({ uidHash: sha256(profileDoc.id), emailHash: sha256(email), reason: 'duplicate-email' });
        console.error(`Duplicate beta email hash ${sha256(email)}; skipping profile ${sha256(profileDoc.id)}.`);
        continue;
      }
      seenEmails.add(email);
      pageAccounts.push({
        uid: profileDoc.id,
        email,
        userProfile: profile,
        userSettings: null,
        userEntitlement: null,
        userMetrics: null,
        cloudCycles: [],
        workflowAwareness: [],
        customProducts: [],
      });
    }
    for (let offset = 0; offset < pageAccounts.length; offset += 10) {
      const results = await Promise.allSettled(pageAccounts.slice(offset, offset + 10).map(migrateAccount));
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          const failedAccount = pageAccounts[offset + index];
          accountFailures.push({ uidHash: sha256(failedAccount.uid), emailHash: sha256(failedAccount.email), reason: result.reason instanceof Error ? result.reason.name : 'unknown-error' });
          console.error(`Failed beta snapshot for account hash ${sha256(failedAccount.uid)}: ${result.reason?.message || 'unknown error'}`);
        }
      }
    }
    if (profilePage.docs.length < 500) break;
    profileCursor = profilePage.docs.at(-1);
  }
  const complete = accountFailures.length === 0 && skippedNoEmail === 0 && malformedLegacyCycles.length === 0;
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({
    projectId,
    fullSnapshotCount,
    userSnapshotCount: count,
    userSnapshotEmailHashes,
    skippedNoEmailCount: skippedNoEmail,
    missingEmailUidHashes: missingEmailHashes,
    accountFailures,
    malformedLegacyCycleCount: malformedLegacyCycles.length,
    malformedLegacyCycleHashes: malformedLegacyCycles,
    complete,
  }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  if (!complete) throw new Error(`Snapshot export incomplete: ${accountFailures.length} account failures, ${skippedNoEmail} profiles without email, and ${malformedLegacyCycles.length} malformed legacy cycles; review manifest.json and rerun into a new output directory.`);
  console.log(`Exported ${fullSnapshotCount} Firestore documents and ${count} beta user snapshots from Firebase project ${projectId}; skipped ${skippedNoEmail} profiles without email.`);
  console.log('Keep this directory private; upload the full snapshot and per-email objects to the configured beta R2 bucket, then securely remove the local copies.');
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
