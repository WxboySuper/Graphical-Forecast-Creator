import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const serializeFirestoreValue = (value) => {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
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
  if (!output) throw new Error('Usage: node server/export-firestore-beta-snapshot.cjs --output <private-directory>');
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
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  await fs.chmod(output, 0o700);
  const fullSnapshotFile = await fs.open(path.join(output, 'full-snapshot.jsonl'), 'wx', 0o600);
  let fullSnapshotCount = 0;
  const exportCollection = async (collectionRef) => {
    let cursor = null;
    while (true) {
      let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(500);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const collectionSnapshot = await pageQuery.get();
      for (const document of collectionSnapshot.docs) {
        await fullSnapshotFile.write(`${JSON.stringify({ path: document.ref.path, data: serializeFirestoreValue(document.data()) })}\n`);
        fullSnapshotCount += 1;
        const childCollections = await document.ref.listCollections();
        await Promise.all(childCollections.map(exportCollection));
      }
      if (collectionSnapshot.docs.length < 500) break;
      cursor = collectionSnapshot.docs.at(-1);
    }
  };
  try {
    for (const collection of await db.listCollections()) await exportCollection(collection);
  } finally {
    await fullSnapshotFile.close();
  }

  const profiles = await db.collection('userProfiles').get();
  const accounts = new Map();

  for (const profileDoc of profiles.docs) {
    const profile = profileDoc.data();
    const email = normalizeEmail(profile.email);
    if (!email) continue;
    if (accounts.has(email)) throw new Error(`Duplicate account email in beta userProfiles: ${email}`);
    accounts.set(email, {
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

  const readOwnedDoc = async (collection, key) => {
    await Promise.all([...accounts.values()].map(async (account) => {
      const snapshot = await db.collection(collection).doc(account.uid).get();
      if (snapshot.exists) account[key] = snapshot.data();
    }));
  };
  await readOwnedDoc('userSettings', 'userSettings');
  await readOwnedDoc('userEntitlements', 'userEntitlement');
  await readOwnedDoc('userMetrics', 'userMetrics');

  await Promise.all([...accounts.values()].map(async (account) => {
    const legacyValue = account.userSettings?.cloudCycles;
    if (legacyValue) {
      let legacy = legacyValue;
      if (typeof legacyValue === 'string') {
        try { legacy = JSON.parse(legacyValue); } catch { legacy = null; }
      }
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        for (const [id, raw] of Object.entries(legacy)) {
          if (!raw || typeof raw !== 'object') continue;
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
    const cycleQuery = await db.collection('cloudCycles').where('userId', '==', account.uid).get();
    const migratedCycles = await Promise.all(cycleQuery.docs.map(async (cycleDoc) => {
      const metadata = cycleDoc.data();
      const payloadDoc = await cycleDoc.ref.collection('payload').doc('payload').get();
      const payloadJson = payloadDoc.exists ? payloadDoc.data()?.payloadJson : metadata.payloadJson;
      return {
        id: cycleDoc.id,
        label: metadata.label,
        cycleDate: metadata.cycleDate,
        metadata,
        payloadJson: typeof payloadJson === 'string' ? payloadJson : '{}',
        payloadBytes: Number(metadata.payloadBytes) || Buffer.byteLength(typeof payloadJson === 'string' ? payloadJson : '{}'),
        createdAt: metadata.createdAt?.toDate?.().toISOString?.() || metadata.createdAt || new Date(0).toISOString(),
        updatedAt: metadata.updatedAt?.toDate?.().toISOString?.() || metadata.updatedAt || new Date(0).toISOString(),
      };
    }));
    for (const cycle of migratedCycles) {
      account.cloudCycles = account.cloudCycles.filter((existingCycle) => existingCycle.id !== cycle.id);
      account.cloudCycles.push(cycle);
    }

    const [awareness, products] = await Promise.all([
      db.collection('users').doc(account.uid).collection('workflowAwareness').get(),
      db.collection('users').doc(account.uid).collection('customProducts').get(),
    ]);
    account.workflowAwareness = awareness.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    account.customProducts = products.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }));

  let count = 0;
  for (const account of accounts.values()) {
    const key = `by-email/${sha256(account.email)}.json`;
    const outPath = path.join(output, key);
    await fs.mkdir(path.dirname(outPath), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(outPath), 0o700);
    const json = JSON.stringify(serializeFirestoreValue(account));
    await fs.writeFile(outPath, json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    console.log(`${key} ${Buffer.byteLength(json)} bytes`);
    count += 1;
  }
  console.log(`Exported ${fullSnapshotCount} Firestore documents and ${count} beta user snapshots from Firebase project ${projectId}.`);
  console.log('Keep this directory private; upload the full snapshot and per-email objects to the configured beta R2 bucket, then securely remove the local copies.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
