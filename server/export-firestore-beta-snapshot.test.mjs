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
  const docRef = (docPath) => ({
    path: docPath,
    get: async () => ({ exists: docPath in documents, data: () => documents[docPath] }),
    listCollections: async () => (subcollections[docPath] || []).map((name) => ({ path: `${docPath}/${name}` })),
  });
  const snapshotOf = (docPath) => ({ id: docPath.split('/').at(-1), ref: docRef(docPath), data: () => documents[docPath] });
  const collection = (name) => ({
    doc: (id) => docRef(`${name}/${id}`),
    where: (field, op, value) => {
      const query = {
        limit: () => query,
        startAfter: () => query,
        get: async () => ({
          docs: Object.keys(documents)
            .filter((docPath) => docPath.startsWith(`${name}/`) && docPath.split('/').length === 2)
            .filter((docPath) => op === '==' && documents[docPath][field] === value)
            .map(snapshotOf),
        }),
      };
      return query;
    },
  });
  return { collection };
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
  it('writes only the included accounts\' documents and their subcollections', async () => {
    const db = createFakeDb({
      'userProfiles/beta-1': { email: 'tester@example.com' },
      'userSettings/beta-1': { theme: 'dark' },
      'userMetrics/beta-1': { opens: 3 },
      'cloudCycles/cycle-a': { userId: 'beta-1', label: 'A' },
      'userProfiles/prod-1': { email: 'prod-user@example.com' },
      'userSettings/prod-1': { theme: 'light' },
      'cloudCycles/cycle-b': { userId: 'prod-1', label: 'B' },
    }, {
      'users/beta-1': ['workflowAwareness'],
      'cloudCycles/cycle-a': ['payload'],
    });
    const lines = [];
    const exportedCollections = [];
    const count = await exportIncludedAccountDocuments({
      db,
      uids: ['beta-1'],
      writeSnapshotLine: async (record) => { lines.push(record); },
      exportCollection: async (collectionRef) => { exportedCollections.push(collectionRef.path); },
    });

    assert.equal(count, 4);
    assert.deepEqual(lines.map((line) => line.path).sort(), [
      'cloudCycles/cycle-a', 'userMetrics/beta-1', 'userProfiles/beta-1', 'userSettings/beta-1',
    ]);
    assert.deepEqual(lines.find((line) => line.path === 'userSettings/beta-1').data, { theme: 'dark' });
    assert.deepEqual(exportedCollections.sort(), ['cloudCycles/cycle-a/payload', 'users/beta-1/workflowAwareness']);
    assert.ok(lines.every((line) => !line.path.includes('prod-1') && !line.path.endsWith('cycle-b')));
  });

  it('writes nothing when no profile matched the list', async () => {
    const db = createFakeDb({ 'userProfiles/prod-1': { email: 'prod-user@example.com' } });
    const lines = [];
    const count = await exportIncludedAccountDocuments({
      db, uids: [], writeSnapshotLine: async (record) => { lines.push(record); }, exportCollection: async () => {},
    });
    assert.equal(count, 0);
    assert.deepEqual(lines, []);
  });
});

describe('serializeFirestoreValue', () => {
  it('tags bytes (Buffers), GeoPoints and timestamps so their types survive JSON', () => {
    const serialized = serializeFirestoreValue({
      blob: Buffer.from('hi'),
      where: new GeoPoint(35.2, -97.4),
      at: Timestamp.fromDate(new Date('2026-11-23T16:00:00.000Z')),
      nested: [{ raw: Buffer.from([0, 255]) }],
    });
    assert.deepEqual(serialized, {
      blob: { __type: 'bytes', base64: 'aGk=' },
      where: { __type: 'geoPoint', latitude: 35.2, longitude: -97.4 },
      at: '2026-11-23T16:00:00.000Z',
      nested: [{ raw: { __type: 'bytes', base64: 'AP8=' } }],
    });
  });
});
