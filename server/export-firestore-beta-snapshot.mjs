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

const readArguments = () => {
  const args = process.argv.slice(2);
  const outputAt = args.indexOf('--output');
  return { output: outputAt >= 0 ? args[outputAt + 1] : '' };
};

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
  await fs.mkdir(output, { mode: 0o700 });
  const fullSnapshotFile = await fs.open(path.join(output, 'full-snapshot.jsonl'), 'wx', 0o600);
  let fullSnapshotCount = 0;
  let snapshotWriteQueue = Promise.resolve();
  const writeSnapshotLine = (record) => {
    snapshotWriteQueue = snapshotWriteQueue.then(() => fullSnapshotFile.write(`${JSON.stringify(record)}\n`));
    return snapshotWriteQueue;
  };
  const exportCollection = async (collectionRef) => {
    let cursor = null;
    while (true) {
      let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(500);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const collectionSnapshot = await pageQuery.get();
      for (const document of collectionSnapshot.docs) {
        await writeSnapshotLine({ path: document.ref.path, data: serializeFirestoreValue(document.data()) });
        fullSnapshotCount += 1;
        const childCollections = await document.ref.listCollections();
        for (let offset = 0; offset < childCollections.length; offset += 10) {
          const results = await Promise.allSettled(childCollections.slice(offset, offset + 10).map(exportCollection));
          const failed = results.find((result) => result.status === 'rejected');
          if (failed) throw failed.reason;
        }
      }
      if (collectionSnapshot.docs.length < 500) break;
      cursor = collectionSnapshot.docs.at(-1);
    }
  };
  const readAllDocuments = async (query) => {
    const documents = [];
    let cursor = null;
    while (true) {
      let pageQuery = query.orderBy(FieldPath.documentId()).limit(500);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const page = await pageQuery.get();
      documents.push(...page.docs);
      if (page.docs.length < 500) break;
      cursor = page.docs.at(-1);
    }
    return documents;
  };
  try {
    for (const collection of await db.listCollections()) await exportCollection(collection);
  } finally {
    await fullSnapshotFile.close();
  }

  const seenEmails = new Set();
  let count = 0;
  let skippedNoEmail = 0;
  const migrateAccount = async (account) => {
    for (const [collection, key] of [['userSettings', 'userSettings'], ['userEntitlements', 'userEntitlement'], ['userMetrics', 'userMetrics']]) {
      const snapshot = await db.collection(collection).doc(account.uid).get();
      if (snapshot.exists) account[key] = snapshot.data();
    }
    const legacyValue = account.userSettings?.cloudCycles;
    if (legacyValue) {
      let legacy = legacyValue;
      if (typeof legacyValue === 'string') {
        try { legacy = JSON.parse(legacyValue); } catch {
          throw new Error(`Unparseable legacy cloudCycles for account hash ${sha256(account.uid)}.`);
        }
      }
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        for (const [id, raw] of Object.entries(legacy)) {
          if (!raw || typeof raw !== 'object') {
            console.warn(`Skipping malformed legacy cycle for account hash ${sha256(account.uid)} cycle hash ${sha256(id)}.`);
            continue;
          }
          const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : raw;
          const payload = raw.payloadJson || raw.payload || '{}';
          account.cloudCycles.push({
            id,
            label: metadata.label || '',
            cycleDate: metadata.cycleDate || '',
            metadata,
            payloadJson: typeof payload === 'string' ? payload : JSON.stringify(payload),
            payloadBytes: Buffer.byteLength(typeof payload === 'string' ? payload : JSON.stringify(payload)),
            createdAt: metadata.createdAt || new Date(0).toISOString(),
            updatedAt: metadata.updatedAt || metadata.createdAt || new Date(0).toISOString(),
          });
        }
      }
    }
    const cycleDocs = await readAllDocuments(db.collection('cloudCycles').where('userId', '==', account.uid));
    const migratedCycles = [];
    for (let offset = 0; offset < cycleDocs.length; offset += 10) {
      const cycleBatch = cycleDocs.slice(offset, offset + 10);
      const payloadDocs = await Promise.all(cycleBatch.map((cycleDoc) => cycleDoc.ref.collection('payload').doc('payload').get()));
      for (const [index, cycleDoc] of cycleBatch.entries()) {
        const metadata = cycleDoc.data();
        const payloadDoc = payloadDocs[index];
        const payloadValue = payloadDoc.exists ? payloadDoc.data()?.payloadJson : metadata.payloadJson;
        const payloadJson = typeof payloadValue === 'string' ? payloadValue : payloadValue == null ? null : JSON.stringify(payloadValue);
        if (typeof payloadJson !== 'string') {
          throw new Error(`Missing cycle payload for account hash ${sha256(account.uid)} cycle hash ${sha256(cycleDoc.id)}.`);
        }
        const normalizedPayload = payloadJson;
        migratedCycles.push({
          id: cycleDoc.id,
          label: metadata.label,
          cycleDate: metadata.cycleDate,
          metadata,
          payloadJson: normalizedPayload,
          payloadBytes: Buffer.byteLength(normalizedPayload),
          createdAt: metadata.createdAt?.toDate?.()?.toISOString?.() || metadata.createdAt || new Date(0).toISOString(),
          updatedAt: metadata.updatedAt?.toDate?.()?.toISOString?.() || metadata.updatedAt || new Date(0).toISOString(),
        });
      }
    }
    for (const cycle of migratedCycles) {
      account.cloudCycles = account.cloudCycles.filter((existingCycle) => existingCycle.id !== cycle.id);
      account.cloudCycles.push(cycle);
    }

    const [awareness, products] = await Promise.all([
      readAllDocuments(db.collection('users').doc(account.uid).collection('workflowAwareness')),
      readAllDocuments(db.collection('users').doc(account.uid).collection('customProducts')),
    ]);
    account.workflowAwareness = awareness.map((doc) => ({ id: doc.id, data: doc.data() }));
    account.customProducts = products.map((doc) => ({ id: doc.id, data: doc.data() }));
    const key = `by-email/${sha256(account.email)}.json`;
    const outPath = path.join(output, key);
    await fs.mkdir(path.dirname(outPath), { recursive: true, mode: 0o700 });
    const json = JSON.stringify(serializeFirestoreValue(account));
    await fs.writeFile(outPath, json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    console.log(`${key} ${Buffer.byteLength(json)} bytes`);
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
        console.warn(`Skipping beta user profile without an email (uid hash ${sha256(profileDoc.id)}).`);
        continue;
      }
      if (seenEmails.has(email)) throw new Error(`Duplicate account email hash in beta userProfiles: ${sha256(email)}`);
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
      await Promise.all(pageAccounts.slice(offset, offset + 10).map(migrateAccount));
    }
    if (profilePage.docs.length < 500) break;
    profileCursor = profilePage.docs.at(-1);
  }
  console.log(`Exported ${fullSnapshotCount} Firestore documents and ${count} beta user snapshots from Firebase project ${projectId}; skipped ${skippedNoEmail} profiles without email.`);
  console.log('Keep this directory private; upload the full snapshot and per-email objects to the configured beta R2 bucket, then securely remove the local copies.');
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
