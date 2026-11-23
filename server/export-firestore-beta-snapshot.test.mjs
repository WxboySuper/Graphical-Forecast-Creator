import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import {
  exportIncludedAccountDocuments,
  isProfileIncluded,
  parseIncludeEmails,
  readArguments,
  serializeFirestoreValue,
} from './export-firestore-beta-snapshot.mjs';

/** Minimal in-memory Firestore stand-in: documents keyed by path, subcollections keyed by parent path. */
function createFakeDb(documents, subcollections = {}) {
  const queries = [];
  const docRef = (docPath) => ({
    path: docPath,
    get: async () => ({ exists: docPath in documents, data: () => documents[docPath] }),
    listCollections: async () => (subcollections[docPath] || []).map((name) => ({ path: `${docPath}/${name}` })),
  });
  const snapshotOf = (docPath) => ({ id: docPath.split('/').at(-1), ref: docRef(docPath), data: () => documents[docPath] });
  const collection = (name) => ({
    doc: (id) => docRef(`${name}/${id}`),
    where: (field, op, value) => {
      let limitCount = Infinity;
      let after = null;
      const query = {
        limit: (count) => { limitCount = count; return query; },
        startAfter: (cursor) => { after = cursor; return query; },
        get: async () => {
          queries.push({ name, after: after?.ref.path ?? null });
          let docs = Object.keys(documents).sort()
            .filter((docPath) => docPath.startsWith(`${name}/`) && docPath.split('/').length === 2)
            .filter((docPath) => op === '==' && documents[docPath][field] === value)
            .map(snapshotOf);
          if (after) docs = docs.slice(docs.findIndex((doc) => doc.ref.path === after.ref.path) + 1);
          return { docs: docs.slice(0, limitCount) };
        },
      };
      return query;
    },
  });
  return { collection, queries };
}

/** Mirrors main(): subcollection documents are written and counted through exportCollection. */
function createCountingExport(documents) {
  const state = { lines: [], subcollectionCount: 0 };
  state.writeSnapshotLine = async (record) => { state.lines.push(record); };
  state.exportCollection = async (collectionRef) => {
    for (const docPath of Object.keys(documents).filter((key) => key.startsWith(`${collectionRef.path}/`))) {
      await state.writeSnapshotLine({ path: docPath, data: documents[docPath] });
      state.subcollectionCount += 1;
    }
  };
  return state;
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

describe('exportIncludedAccountDocuments', () => {
  it('writes only the included accounts\' documents, and every written line is counted', async () => {
    const documents = {
      'userProfiles/beta-1': { email: 'tester@example.com' },
      'userSettings/beta-1': { theme: 'dark' },
      'userMetrics/beta-1': { opens: 3 },
      'users/beta-1/workflowAwareness/w1': { seen: true },
      'users/beta-1/customProducts/p1': { name: 'Mine' },
      'cloudCycles/cycle-a': { userId: 'beta-1', label: 'A' },
      'cloudCycles/cycle-a/payload/payload': { payloadJson: '{}' },
      'userProfiles/prod-1': { email: 'prod-user@example.com' },
      'userSettings/prod-1': { theme: 'light' },
      'users/prod-1/customProducts/p2': { name: 'Theirs' },
      'cloudCycles/cycle-b': { userId: 'prod-1', label: 'B' },
    };
    const db = createFakeDb(documents, {
      'users/beta-1': ['workflowAwareness', 'customProducts'],
      'users/prod-1': ['customProducts'],
      'cloudCycles/cycle-a': ['payload'],
    });
    const exporter = createCountingExport(documents);
    const directCount = await exportIncludedAccountDocuments({
      db, uids: ['beta-1'], writeSnapshotLine: exporter.writeSnapshotLine, exportCollection: exporter.exportCollection,
    });

    assert.equal(directCount, 4);
    assert.equal(directCount + exporter.subcollectionCount, exporter.lines.length);
    assert.deepEqual(exporter.lines.map((line) => line.path).sort(), [
      'cloudCycles/cycle-a',
      'cloudCycles/cycle-a/payload/payload',
      'userMetrics/beta-1',
      'userProfiles/beta-1',
      'userSettings/beta-1',
      'users/beta-1/customProducts/p1',
      'users/beta-1/workflowAwareness/w1',
    ]);
    assert.deepEqual(exporter.lines.find((line) => line.path === 'userSettings/beta-1').data, { theme: 'dark' });
  });

  it('pages through more than 500 owned cloud cycles without repeating or dropping any', async () => {
    const documents = {};
    for (let index = 0; index < 1001; index += 1) documents[`cloudCycles/c${String(index).padStart(4, '0')}`] = { userId: 'beta-1' };
    const db = createFakeDb(documents);
    const exporter = createCountingExport(documents);
    const directCount = await exportIncludedAccountDocuments({
      db, uids: ['beta-1'], writeSnapshotLine: exporter.writeSnapshotLine, exportCollection: exporter.exportCollection,
    });
    assert.equal(directCount, 1001);
    assert.equal(new Set(exporter.lines.map((line) => line.path)).size, 1001);
    assert.deepEqual(db.queries.map((query) => query.after), [null, 'cloudCycles/c0499', 'cloudCycles/c0999']);
  });

  it('writes nothing when no profile matched the list', async () => {
    const documents = { 'userProfiles/prod-1': { email: 'prod-user@example.com' } };
    const exporter = createCountingExport(documents);
    const directCount = await exportIncludedAccountDocuments({
      db: createFakeDb(documents), uids: [], writeSnapshotLine: exporter.writeSnapshotLine, exportCollection: exporter.exportCollection,
    });
    assert.equal(directCount, 0);
    assert.deepEqual(exporter.lines, []);
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
    });
    assert.deepEqual(serialized, {
      blob: { __type: 'bytes', base64: 'aGk=' },
      where: { __type: 'geoPoint', latitude: 35.2, longitude: -97.4 },
      at: '2026-11-23T16:00:00.000Z',
      nested: [{ raw: { __type: 'bytes', base64: 'AP8=' } }],
      view: { __type: 'bytes', base64: 'AgM=' },
    });
  });
});
