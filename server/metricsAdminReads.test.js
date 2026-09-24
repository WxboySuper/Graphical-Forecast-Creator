'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const adminReadsPath = require.resolve('./metricsAdminReads');
const metricsPath = require.resolve('./metrics');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];

let lastDb = null;
let lastAuth = null;
let lastConfig = true;

require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: {
    getAdminDb: () => lastDb,
    getAdminAuth: () => lastAuth,
    hasFirebaseAdminConfig: () => lastConfig,
  },
};

const loadAdminReads = () => {
  delete require.cache[adminReadsPath];
  delete require.cache[metricsPath];
  return require('./metricsAdminReads');
};

let adminReads;

beforeEach(() => {
  lastDb = null;
  lastAuth = null;
  lastConfig = true;
  delete process.env.ADMIN_UID_ALLOWLIST;
  adminReads = loadAdminReads();
  adminReads.resetAdminMetricsCachesForTests();
});

after(() => {
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[adminReadsPath];
  delete require.cache[metricsPath];
  delete process.env.ADMIN_UID_ALLOWLIST;
});

const createSnapshotDb = ({
  dailyDocs = {},
  premiumCount = 4,
  totalAccounts = 9,
  storageCounts = {},
  payloadBytes = 100,
} = {}) => {
  const collection = (name) => {
    if (name === 'userEntitlements') {
      return {
        where: () => ({
          count: () => ({ get: async () => ({ data: () => ({ count: premiumCount }) }) }),
          get: async () => ({ size: premiumCount }),
        }),
        count: () => ({ get: async () => ({ data: () => ({ count: storageCounts[name] ?? 0 }) }) }),
        limit: () => ({ get: async () => ({ docs: [] }) }),
      };
    }
    if (name === 'adminDailyMetrics') {
      return {
        doc: (id) => ({ id, collection: name }),
        count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }),
      };
    }
    return {
      doc: (id) => ({ id, collection: name }),
      count: () => ({ get: async () => ({ data: () => ({ count: storageCounts[name] ?? 0 }) }) }),
      aggregate: () => ({ get: async () => ({ data: () => ({ payloadBytes }) }) }),
      limit: () => ({ get: async () => ({ docs: [] }) }),
    };
  };
  // userProfiles aggregate doubles as the total-accounts count.
  const baseCollection = collection;
  const wrappedCollection = (name) => {
    const ref = baseCollection(name);
    if (name === 'userProfiles') {
      return { ...ref, count: () => ({ get: async () => ({ data: () => ({ count: totalAccounts }) }) }) };
    }
    return ref;
  };
  return {
    collection: wrappedCollection,
    getAll: async (...refs) => refs.map((ref) => {
      const data = dailyDocs[ref.id];
      if (!data) return { id: ref.id, exists: false, data: () => ({}) };
      return { id: ref.id, exists: true, data: () => data };
    }),
  };
};

describe('metrics admin reads extraction', () => {
  it('normalizes supported windows and falls back to 7', () => {
    assert.equal(adminReads.normalizeAdminWindowSize('7'), 7);
    assert.equal(adminReads.normalizeAdminWindowSize('30'), 30);
    assert.equal(adminReads.normalizeAdminWindowSize('14'), 7);
    assert.equal(adminReads.normalizeAdminWindowSize(undefined), 7);
    assert.equal(adminReads.normalizeAdminWindowSize('bogus'), 7);
  });

  it('returns an empty window when no admin database is configured', async () => {
    lastDb = null;
    assert.deepEqual(await adminReads.readAdminMetricsWindow(7), []);
  });

  it('reads, filters, and sorts the requested admin window', async () => {
    lastDb = createSnapshotDb({
      dailyDocs: {
        '2026-09-20': { signups: 1 },
        '2026-09-21': { signups: 2 },
      },
    });
    // Seed only two docs; the rest of the 7-day window is missing and filtered out.
    const window = await adminReads.readAdminMetricsWindow(7);
    const dates = window.map((entry) => entry.date);
    assert.deepEqual(dates, [...dates].sort());
    assert.ok(dates.includes('2026-09-20'));
    assert.ok(dates.includes('2026-09-21'));
    assert.equal(window.find((entry) => entry.date === '2026-09-21').signups, 2);
  });

  it('builds one snapshot with live premium, storage, and account totals', async () => {
    lastDb = createSnapshotDb({
      dailyDocs: { '2026-09-21': { signups: 2, cloudSaves: 1 } },
      premiumCount: 4,
      totalAccounts: 9,
      storageCounts: { cloudCycles: 1 },
      payloadBytes: 100,
    });

    const snapshot = await adminReads.getAdminMetricsSnapshot('7');

    assert.equal(snapshot.window, 7);
    assert.ok(Array.isArray(snapshot.dailyMetrics));
    assert.equal(snapshot.summary.premiumSubscriptions, 4);
    assert.equal(snapshot.summary.totalAccounts, 9);
    assert.equal(typeof snapshot.summary.storageBytes, 'number');
    assert.ok(snapshot.summary.storageBytes >= 100);
  });

  it('falls back to a 7-day window for unsupported values', async () => {
    lastDb = createSnapshotDb();
    const snapshot = await adminReads.getAdminMetricsSnapshot('14');
    assert.equal(snapshot.window, 7);
  });

  it('keeps metrics.js compatibility exports bound to the same aggregation instance', () => {
    const metrics = require('./metrics');
    assert.equal(metrics.countPremiumSubscriptions, adminReads.countPremiumSubscriptions);
    assert.equal(metrics.countTotalAccounts, adminReads.countTotalAccounts);
    assert.equal(metrics.getCurrentStorageBytes, adminReads.getCurrentStorageBytes);
    assert.equal(metrics.countCollectionDocuments, adminReads.countCollectionDocuments);
    assert.equal(metrics.readCloudCyclePayloadBytes, adminReads.readCloudCyclePayloadBytes);
  });

  it('preserves the admin dashboard response shape through handleAdminMetrics', async () => {
    lastDb = createSnapshotDb({
      dailyDocs: { '2026-09-21': { signups: 3 } },
      premiumCount: 5,
      totalAccounts: 11,
    });
    lastAuth = { verifyIdToken: async () => ({ uid: 'admin-1' }) };
    process.env.ADMIN_UID_ALLOWLIST = 'admin-1';
    const metrics = require('./metrics');

    let payload = null;
    const res = { json: (body) => { payload = body; }, status: () => res };
    await metrics.handleAdminMetrics(
      { query: { window: '7' }, headers: { authorization: 'Bearer token' } },
      res
    );

    assert.equal(payload.metricsEnabled, true);
    assert.equal(payload.window, 7);
    assert.ok(Array.isArray(payload.dailyMetrics));
    assert.equal(payload.summary.premiumSubscriptions, 5);
    assert.equal(payload.summary.totalAccounts, 11);
  });

  it('always returns a Promise from countPremiumSubscriptions, including no-database and cache-hit paths', async () => {
    lastDb = null;
    const noDbResult = adminReads.countPremiumSubscriptions();
    assert.ok(noDbResult instanceof Promise);
    assert.equal(await noDbResult, 0);

    lastDb = createSnapshotDb({ premiumCount: 4 });
    const first = adminReads.countPremiumSubscriptions();
    assert.ok(first instanceof Promise);
    assert.equal(await first, 4);

    const cached = adminReads.countPremiumSubscriptions();
    assert.ok(cached instanceof Promise);
    assert.equal(await cached, 4);
  });

  it('always returns a Promise from countTotalAccounts, including no-database and cache-hit paths', async () => {
    lastDb = null;
    const noDbResult = adminReads.countTotalAccounts();
    assert.ok(noDbResult instanceof Promise);
    assert.equal(await noDbResult, 0);

    lastDb = createSnapshotDb({ totalAccounts: 9 });
    const first = adminReads.countTotalAccounts();
    assert.ok(first instanceof Promise);
    assert.equal(await first, 9);

    const cached = adminReads.countTotalAccounts();
    assert.ok(cached instanceof Promise);
    assert.equal(await cached, 9);
  });
});
