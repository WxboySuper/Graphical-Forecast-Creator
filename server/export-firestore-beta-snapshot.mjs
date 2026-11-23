import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { DocumentReference, FieldPath, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const MAX_SNAPSHOT_CYCLES = 300;
const MAX_SNAPSHOT_WORKFLOW_RECORDS = 200;
const MAX_SNAPSHOT_CUSTOM_PRODUCTS = 48;
const FIRESTORE_VALUE_SERIALIZERS = new Map([
  [Timestamp, (value) => value.toDate().toISOString()],
  [GeoPoint, (value) => ({ __type: 'geoPoint', latitude: value.latitude, longitude: value.longitude })],
  [DocumentReference, (value) => ({ __type: 'documentReference', path: value.path })],
]);

function assertSnapshotCollectionLimit(context) {
  const { currentCount, pageCount, limit, collectionName, accountId } = context;
  if (currentCount + pageCount > limit) {
    throw new Error(`Snapshot ${collectionName} limit exceeded for account hash ${sha256(accountId)}.`);
  }
}

async function writeUserSnapshot(output, account) {
  const key = `by-email/${sha256(account.email)}.json`;
  const outPath = path.join(output, key);
  await fs.mkdir(path.dirname(outPath), { recursive: true, mode: 0o700 });
  const json = JSON.stringify(serializeFirestoreValue(account));
  await fs.writeFile(outPath, json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log(`${key} ${Buffer.byteLength(json)} bytes`);
  return sha256(account.email);
}

function createAccountFailure(uid, email, error) {
  const reason = error instanceof Error ? error.message : String(error || 'unknown error');
  return { uidHash: sha256(uid), emailHash: sha256(email), reason: reason.slice(0, 500) };
}
export const serializeFirestoreValue = (value) => {
  // The Admin SDK returns Firestore bytes fields as Node Buffers (it has no Bytes class). ArrayBuffer.isView is
  // realm-safe, so Buffers, typed arrays and DataViews from any realm are tagged too (no silent data loss).
  if (ArrayBuffer.isView(value)) return { __type: 'bytes', base64: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  // Compatibility: an SDK/emulator that returns a Bytes instance instead of a Buffer.
  if (typeof value?.toBase64 === 'function') return { __type: 'bytes', base64: value.toBase64() };
  const serializer = FIRESTORE_VALUE_SERIALIZERS.get(value?.constructor);
  if (serializer) return serializer(value);
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
  assertSnapshotCollectionLimit({
    currentCount: account.cloudCycles.length, pageCount: cycleDocs.length,
    limit: MAX_SNAPSHOT_CYCLES, collectionName: 'cycle', accountId: account.uid,
  });
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

const readFlagValue = (args, flag) => {
  const at = args.indexOf(flag);
  if (at < 0) return '';
  const value = args[at + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
};

export const readArguments = (args = process.argv.slice(2)) => ({
  output: readFlagValue(args, '--output'),
  includeEmailsPath: readFlagValue(args, '--include-emails'),
});

/**
 * Parses an include list: one email per line, normalized like the snapshot hash key.
 * Blank lines and lines starting with # are ignored. Returns a Set of normalized emails.
 */
export const parseIncludeEmails = (text) => {
  const emails = new Set();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const email = normalizeEmail(line);
    if (!email || email.startsWith('#')) continue;
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(`Include list line ${index + 1} is not an email address.`);
    emails.add(email);
  }
  if (emails.size === 0) throw new Error('Include list contains no email addresses.');
  return emails;
};

export const readIncludeEmails = async (includeEmailsPath) =>
  includeEmailsPath ? parseIncludeEmails(await fs.readFile(includeEmailsPath, 'utf8')) : null;

/** Without an include list every profile is eligible; with one, only listed (normalized) emails are. */
export const isProfileIncluded = (profile, includeEmails) =>
  !includeEmails || includeEmails.has(normalizeEmail(profile?.email));

/**
 * Decides how the profile scan treats one profile: 'excluded' (not on the include list), 'missing-email',
 * 'duplicate-email', or 'included'. The include-list check runs first so unlisted profiles never count as
 * missing an email. Records included emails in seenEmails.
 */
export const classifyProfile = (profile, { includeEmails, seenEmails }) => {
  if (!isProfileIncluded(profile, includeEmails)) return { status: 'excluded' };
  const email = normalizeEmail(profile?.email);
  if (!email) return { status: 'missing-email' };
  if (seenEmails.has(email)) return { status: 'duplicate-email', email };
  seenEmails.add(email);
  return { status: 'included', email };
};

/** Writes one document (when it exists) and every subcollection beneath it; returns the documents written here. */
async function exportDocumentTree(docRef, writeSnapshotLine, exportCollection) {
  const document = await docRef.get();
  let written = 0;
  if (document.exists) {
    await writeSnapshotLine({ path: docRef.path, data: serializeFirestoreValue(document.data()) });
    written = 1;
  }
  // Subcollections can exist under a document that has no fields of its own (for example users/{uid}).
  for (const child of await docRef.listCollections()) await exportCollection(child);
  return written;
}

/**
 * Full-snapshot export limited to the included accounts' own documents, the same set account-lifecycle.js deletes:
 * their root user documents, the users/{uid} subtree, owned cloudCycles (with subcollections) and adminMetricDedupes.
 */
const ACCOUNT_ROOT_COLLECTIONS = ['userProfiles', 'userSettings', 'userEntitlements', 'userMetrics', 'users'];

// Top-level collections whose account documents are found by an owner field, matching account-lifecycle.js.
const ACCOUNT_OWNED_QUERIES = [['cloudCycles', 'userId'], ['adminMetricDedupes', 'uid']];

// An equality filter plus orderBy(documentId) is served by the automatic single-field indexes (no composite index
// needed), and gives snapshot cursors a stable, explicit order.
async function exportOwnedDocuments({ db, uid, collectionName, ownerField, writeSnapshotLine, exportCollection }) {
  let exportedCount = 0;
  let cursor = null;
  while (true) {
    let ownedQuery = db.collection(collectionName).where(ownerField, '==', uid).orderBy(FieldPath.documentId()).limit(500);
    if (cursor) ownedQuery = ownedQuery.startAfter(cursor);
    const owned = await ownedQuery.get();
    for (let offset = 0; offset < owned.docs.length; offset += 10) {
      const page = owned.docs.slice(offset, offset + 10);
      await exportSnapshotPage(page, writeSnapshotLine, exportCollection);
      exportedCount += page.length;
    }
    if (owned.docs.length < 500) return exportedCount;
    cursor = owned.docs.at(-1);
  }
}

/**
 * Returns the number of documents written directly here (account root documents and owned cycle documents).
 * Documents in subcollections are written, and counted, by the caller's exportCollection, exactly as in the
 * unfiltered listCollections() export; main() adds both for the manifest's fullSnapshotCount.
 */
export async function exportIncludedAccountDocuments({ db, uids, writeSnapshotLine, exportCollection }) {
  let exportedCount = 0;
  for (const uid of uids) {
    const rootCounts = await Promise.all(ACCOUNT_ROOT_COLLECTIONS.map((collectionName) =>
      exportDocumentTree(db.collection(collectionName).doc(uid), writeSnapshotLine, exportCollection)));
    exportedCount += rootCounts.reduce((sum, written) => sum + written, 0);
    for (const [collectionName, ownerField] of ACCOUNT_OWNED_QUERIES) {
      exportedCount += await exportOwnedDocuments({ db, uid, collectionName, ownerField, writeSnapshotLine, exportCollection });
    }
  }
  return exportedCount;
}

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

/**
 * Recursive collection export that counts every document it writes, including nested subcollections.
 * Sibling subcollections export concurrently, so each count is awaited before it is added; the shorthand
 * `count += await ...` would read a stale count and drop concurrent additions.
 */
export function createCollectionExporter(writeSnapshotLine) {
  let count = 0;
  const exportCollection = async (collectionRef) => {
    const exportedCount = await exportCollectionPages(collectionRef, writeSnapshotLine, exportCollection);
    count += exportedCount;
  };
  return { exportCollection, getCount: () => count };
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
  const { output, includeEmailsPath } = readArguments();
  if (!output) throw new Error('Usage: node server/export-firestore-beta-snapshot.mjs --output <private-directory> [--include-emails <file>]');
  const includeEmails = await readIncludeEmails(includeEmailsPath);
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
  const fullSnapshotPath = path.join(output, 'full-snapshot.jsonl');
  let fullSnapshotFile = null;
  // Documents written outside collectionExporter (filtered mode's account root and owned documents).
  let directSnapshotCount = 0;
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
  const collectionExporter = createCollectionExporter(writeSnapshotLine);
  const { exportCollection } = collectionExporter;
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
  // Opens the snapshot file only for the export itself, so a failure elsewhere never leaves it open.
  const writeFullSnapshot = async (exportDocuments) => {
    fullSnapshotFile = await fs.open(fullSnapshotPath, 'wx', 0o600);
    try {
      await exportDocuments();
    } finally {
      try { await snapshotWriteQueue; }
      finally { await fullSnapshotFile.close(); }
    }
  };
  if (!includeEmails) {
    await writeFullSnapshot(async () => {
      for (const collection of await db.listCollections()) await exportCollection(collection);
    });
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
  const includedUids = [];
  let excludedProfileCount = 0;
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
        assertSnapshotCollectionLimit({
          currentCount: account.workflowAwareness.length, pageCount: page.length,
          limit: MAX_SNAPSHOT_WORKFLOW_RECORDS, collectionName: 'workflow record', accountId: account.uid,
        });
        account.workflowAwareness.push(...page.map((doc) => ({ id: doc.id, data: doc.data() })));
      }),
      forEachDocumentPage(db.collection('users').doc(account.uid).collection('customProducts'), (page) => {
        assertSnapshotCollectionLimit({
          currentCount: account.customProducts.length, pageCount: page.length,
          limit: MAX_SNAPSHOT_CUSTOM_PRODUCTS, collectionName: 'custom product', accountId: account.uid,
        });
        account.customProducts.push(...page.map((doc) => ({ id: doc.id, data: doc.data() })));
      }),
    ]);
    userSnapshotEmailHashes.push(await writeUserSnapshot(output, account));
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
      const { status, email } = classifyProfile(profile, { includeEmails, seenEmails });
      if (status === 'excluded') {
        excludedProfileCount += 1;
        continue;
      }
      if (status === 'missing-email') {
        skippedNoEmail += 1;
        missingEmailHashes.push(sha256(profileDoc.id));
        console.warn(`Skipping beta user profile without an email (uid hash ${sha256(profileDoc.id)}).`);
        continue;
      }
      if (status === 'duplicate-email') {
        accountFailures.push({ uidHash: sha256(profileDoc.id), emailHash: sha256(email), reason: 'duplicate-email' });
        console.error(`Duplicate beta email hash ${sha256(email)}; skipping profile ${sha256(profileDoc.id)}.`);
        continue;
      }
      if (includeEmails) includedUids.push(profileDoc.id);
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
          accountFailures.push(createAccountFailure(failedAccount.uid, failedAccount.email, result.reason));
          console.error(`Failed beta snapshot for account hash ${sha256(failedAccount.uid)}: ${result.reason?.message || 'unknown error'}`);
        }
      }
    }
    if (profilePage.docs.length < 500) break;
    profileCursor = profilePage.docs.at(-1);
  }
  const includeSummary = {};
  let unmatchedIncludeCount = 0;
  if (includeEmails) {
    await writeFullSnapshot(async () => {
      directSnapshotCount = await exportIncludedAccountDocuments({ db, uids: includedUids, writeSnapshotLine, exportCollection });
    });
    const unmatchedIncludeEmailHashes = [...includeEmails].filter((email) => !seenEmails.has(email)).map(sha256);
    unmatchedIncludeCount = unmatchedIncludeEmailHashes.length;
    if (unmatchedIncludeEmailHashes.length) console.warn(`${unmatchedIncludeEmailHashes.length} included emails matched no Firestore profile.`);
    Object.assign(includeSummary, {
      includeEmailCount: includeEmails.size,
      excludedProfileCount,
      unmatchedIncludeEmailHashes,
    });
  }
  const fullSnapshotCount = directSnapshotCount + collectionExporter.getCount();
  const complete = accountFailures.length === 0 && skippedNoEmail === 0 && malformedLegacyCycles.length === 0 && unmatchedIncludeCount === 0;
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
    ...includeSummary,
    complete,
  }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  if (!complete) throw new Error(`Snapshot export incomplete: ${accountFailures.length} account failures, ${skippedNoEmail} profiles without email, ${malformedLegacyCycles.length} malformed legacy cycles, and ${unmatchedIncludeCount} unmatched include emails; review manifest.json and rerun into a new output directory.`);
  console.log(`Exported ${fullSnapshotCount} Firestore documents and ${count} beta user snapshots from Firebase project ${projectId}; skipped ${skippedNoEmail} profiles without email.`);
  console.log('Keep this directory private; upload the full snapshot and per-email objects to the configured beta R2 bucket, then securely remove the local copies.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
