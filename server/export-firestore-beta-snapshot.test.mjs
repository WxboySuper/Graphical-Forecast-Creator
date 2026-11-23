import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import {
  classifyProfile,
  createCollectionExporter,
  exportIncludedAccountDocuments,
  isProfileIncluded,
  parseIncludeEmails,
  readArguments,
  serializeFirestoreValue,
} from './export-firestore-beta-snapshot.mjs';

/**
 * Minimal in-memory Firestore stand-in. Documents are keyed by full path; subcollections are keyed by parent
 * document path. Queries return documents in document-name order, like Firestore's default ordering.
 */
function createFakeDb(documents, subcollections = {}) {
  const queries = [];
  const docRef = (docPath) => ({
    path: docPath,
    get: async () => ({ exists: Object.hasOwn(documents, docPath), data: () => documents[docPath] }),
    collection: (id) => collectionRef(`${docPath}/${id}`),
    listCollections: async () => (subcollections[docPath] || []).map((name) => collectionRef(`${docPath}/${name}`)),
  });
  const snapshotOf = (docPath) => ({ id: docPath.split('/').at(-1), ref: docRef(docPath), data: () => documents[docPath] });
  const depth = (collectionPath) => collectionPath.split('/').length + 1;
  // Immutable like real Firestore queries: every builder call returns a new query, so dropped reassignments show up.
  const query = (collectionPath, ownerFilter, state = { limitCount: Infinity, after: null, ordered: false }) => ({
    orderBy: () => query(collectionPath, ownerFilter, { ...state, ordered: true }),
    limit: (count) => query(collectionPath, ownerFilter, { ...state, limitCount: count }),
    startAfter: (cursor) => query(collectionPath, ownerFilter, { ...state, after: cursor }),
    get: async () => {
      queries.push({ collectionPath, ordered: state.ordered, limitCount: state.limitCount, after: state.after?.ref.path ?? null });
      let docs = Object.keys(documents).sort()
        .filter((docPath) => docPath.startsWith(`${collectionPath}/`) && docPath.split('/').length === depth(collectionPath))
        .filter((docPath) => ownerFilter === null || documents[docPath][ownerFilter.field] === ownerFilter.value)
        .map(snapshotOf);
      if (state.after) docs = docs.slice(docs.findIndex((doc) => doc.ref.path === state.after.ref.path) + 1);
      return { docs: docs.slice(0, state.limitCount) };
    },
  });
  const collectionRef = (collectionPath) => ({
    path: collectionPath,
    doc: (id) => docRef(`${collectionPath}/${id}`),
    where: (field, op, value) => {
      assert.equal(op, '==');
      return query(collectionPath, { field, value });
    },
    ...query(collectionPath, null),
  });
  return { collection: collectionRef, queries };
}

/** Uses the same collection exporter main() uses, so subcollection counts come from the real plumbing. */
function createCountingExport() {
  const lines = [];
  const writeSnapshotLine = async (record) => { lines.push(record); };
  const { exportCollection, getCount } = createCollectionExporter(writeSnapshotLine);
  return {
    lines, writeSnapshotLine, exportCollection,
    get subcollectionCount() { return getCount(); },
  };
}

describe('readArguments', () => {
  it('reads --output and the optional --include-emails file', () => {
    assert.deepEqual(readArguments(['--output', '/tmp/out']), { output: '/tmp/out', includeEmailsPath: '' });
    assert.deepEqual(
      readArguments(['--output', '/tmp/out', '--include-emails', '/tmp/list.txt']),
      { output: '/tmp/out', includeEmailsPath: '/tmp/list.txt' },
    );
  });

  it('rejects a flag without a value', () => {
    assert.throws(() => readArguments(['--output', '/tmp/out', '--include-emails']), /--include-emails requires a value/);
    assert.throws(() => readArguments(['--include-emails', '--output', '/tmp/out']), /--include-emails requires a value/);
  });
});

describe('parseIncludeEmails', () => {
  it('normalizes emails like the snapshot hash key and skips blanks and comments', () => {
    const emails = parseIncludeEmails('  Tester@Example.COM \r\n\n# beta testers\nsecond@example.com\ntester@example.com\n');
    assert.deepEqual([...emails], ['tester@example.com', 'second@example.com']);
  });

  it('rejects lines that are not email addresses', () => {
    assert.throws(() => parseIncludeEmails('ok@example.com\nnot-an-email\n'), /line 2 is not an email/);
  });

  it('rejects an empty list so a typo cannot produce an empty export', () => {
    assert.throws(() => parseIncludeEmails('\n# nothing here\n'), /no email addresses/);
  });
});

describe('isProfileIncluded', () => {
  it('includes every profile when no list is given', () => {
    assert.equal(isProfileIncluded({ email: 'anyone@example.com' }, null), true);
    assert.equal(isProfileIncluded({}, null), true);
  });

  it('includes only listed emails, ignoring case and whitespace, and excludes profiles without email', () => {
    const list = parseIncludeEmails('tester@example.com');
    assert.equal(isProfileIncluded({ email: ' TESTER@example.com ' }, list), true);
    assert.equal(isProfileIncluded({ email: 'prod-user@example.com' }, list), false);
    assert.equal(isProfileIncluded({}, list), false);
  });
});

describe('classifyProfile', () => {
  it('drops unlisted profiles before the missing-email check, then rejects duplicates', () => {
    const includeEmails = parseIncludeEmails('tester@example.com');
    const seenEmails = new Set();
    assert.deepEqual(classifyProfile({}, { includeEmails, seenEmails }), { status: 'excluded' });
    assert.deepEqual(classifyProfile({ email: 'prod-user@example.com' }, { includeEmails, seenEmails }), { status: 'excluded' });
    assert.deepEqual(classifyProfile({ email: 'Tester@Example.com' }, { includeEmails, seenEmails }), { status: 'included', email: 'tester@example.com' });
    assert.deepEqual(classifyProfile({ email: 'tester@example.com ' }, { includeEmails, seenEmails }), { status: 'duplicate-email', email: 'tester@example.com' });
  });

  it('keeps the original behavior without a list', () => {
    const seenEmails = new Set();
    assert.deepEqual(classifyProfile({}, { includeEmails: null, seenEmails }), { status: 'missing-email' });
    assert.deepEqual(classifyProfile({ email: 'a@example.com' }, { includeEmails: null, seenEmails }), { status: 'included', email: 'a@example.com' });
  });
});

describe('exportIncludedAccountDocuments', () => {
  it('writes only the included accounts\' documents, and every written line is counted', async () => {
    const documents = {
      'userProfiles/beta-1': { email: 'tester@example.com' },
      'userSettings/beta-1': { theme: 'dark', blob: Buffer.from('hi') },
      'userMetrics/beta-1': { opens: 3 },
      'users/beta-1/workflowAwareness/w1': { seen: true },
      'users/beta-1/customProducts/p1': { name: 'Mine' },
      'cloudCycles/cycle-a': { userId: 'beta-1', label: 'A' },
      'cloudCycles/cycle-a/payload/payload': { payloadJson: '{}' },
      'adminMetricDedupes/d1': { uid: 'beta-1' },
      'userProfiles/prod-1': { email: 'prod-user@example.com' },
      'userSettings/prod-1': { theme: 'light' },
      'users/prod-1/customProducts/p2': { name: 'Theirs' },
      'cloudCycles/cycle-b': { userId: 'prod-1', label: 'B' },
      'adminMetricDedupes/d2': { uid: 'prod-1' },
    };
    const db = createFakeDb(documents, {
      'users/beta-1': ['workflowAwareness', 'customProducts'],
      'users/prod-1': ['customProducts'],
      'cloudCycles/cycle-a': ['payload'],
    });
    const exporter = createCountingExport();
    const directCount = await exportIncludedAccountDocuments({
      db, uids: ['beta-1'], writeSnapshotLine: exporter.writeSnapshotLine, exportCollection: exporter.exportCollection,
    });

    assert.equal(directCount, 5);
    assert.equal(exporter.subcollectionCount, 3);
    assert.equal(directCount + exporter.subcollectionCount, exporter.lines.length);
    assert.deepEqual(exporter.lines.map((line) => line.path).sort(), [
      'adminMetricDedupes/d1',
      'cloudCycles/cycle-a',
      'cloudCycles/cycle-a/payload/payload',
      'userMetrics/beta-1',
      'userProfiles/beta-1',
      'userSettings/beta-1',
      'users/beta-1/customProducts/p1',
      'users/beta-1/workflowAwareness/w1',
    ]);
    assert.deepEqual(exporter.lines.find((line) => line.path === 'userSettings/beta-1').data,
      { theme: 'dark', blob: { __type: 'bytes', base64: 'aGk=' } });
  });

  it('pages through more than 500 owned cloud cycles without repeating or dropping any', async () => {
    const documents = {};
    for (let index = 0; index < 1001; index += 1) documents[`cloudCycles/c${String(index).padStart(4, '0')}`] = { userId: 'beta-1' };
    const db = createFakeDb(documents);
    const exporter = createCountingExport();
    const directCount = await exportIncludedAccountDocuments({
      db, uids: ['beta-1'], writeSnapshotLine: exporter.writeSnapshotLine, exportCollection: exporter.exportCollection,
    });
    assert.equal(directCount, 1001);
    assert.equal(new Set(exporter.lines.map((line) => line.path)).size, 1001);
    assert.equal(db.queries.filter((query) => query.collectionPath === 'cloudCycles').length, Math.ceil(1001 / 500));
    assert.ok(db.queries.every((query) => query.ordered && query.limitCount === 500));
  });

  it('writes nothing when no profile matched the list', async () => {
    const documents = { 'userProfiles/prod-1': { email: 'prod-user@example.com' } };
    const exporter = createCountingExport();
    const directCount = await exportIncludedAccountDocuments({
      db: createFakeDb(documents), uids: [], writeSnapshotLine: exporter.writeSnapshotLine, exportCollection: exporter.exportCollection,
    });
    assert.equal(directCount, 0);
    assert.deepEqual(exporter.lines, []);
  });
});

describe('createCollectionExporter', () => {
  it('counts every nested document when sibling subcollections export concurrently', async () => {
    const documents = {};
    const subcollections = {};
    for (let index = 0; index < 12; index += 1) {
      documents[`cloudCycles/c${index}`] = { userId: 'u' };
      documents[`cloudCycles/c${index}/payload/payload`] = { payloadJson: '{}' };
      subcollections[`cloudCycles/c${index}`] = ['payload'];
    }
    const db = createFakeDb(documents, subcollections);
    const exporter = createCountingExport();
    await exporter.exportCollection(db.collection('cloudCycles'));
    assert.equal(exporter.lines.length, 24);
    assert.equal(exporter.subcollectionCount, 24);
  });
});

describe('serializeFirestoreValue', () => {
  it('tags bytes (Buffers), GeoPoints and timestamps so their types survive JSON', () => {
    const serialized = serializeFirestoreValue({
      blob: Buffer.from('hi'),
      where: new GeoPoint(35.2, -97.4),
      at: Timestamp.fromDate(new Date('2026-11-23T16:00:00.000Z')),
      nested: [{ raw: Buffer.from([0, 255]) }],
      view: new Uint8Array([1, 2, 3]).subarray(1),
      dataView: new DataView(new ArrayBuffer(2)),
    });
    assert.deepEqual(serialized, {
      blob: { __type: 'bytes', base64: 'aGk=' },
      where: { __type: 'geoPoint', latitude: 35.2, longitude: -97.4 },
      at: '2026-11-23T16:00:00.000Z',
      nested: [{ raw: { __type: 'bytes', base64: 'AP8=' } }],
      view: { __type: 'bytes', base64: 'AgM=' },
      dataView: { __type: 'bytes', base64: 'AAA=' },
    });
  });
});
