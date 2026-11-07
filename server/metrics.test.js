'use strict';

/**
 * Server metrics test boundary: this suite verifies analytics event handling,
 * validation, persistence, and failure behavior at the server metrics adapter
 * with Firebase dependencies isolated in test doubles.
 */

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const metricsPath = require.resolve('./metrics');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const originalDateNow = Date.now;
const documents = new Map();
let aggregateGet = async () => ({ data: () => ({ count: 3 }) });
let fallbackDocs = [];
let fallbackGet = async () => ({ docs: fallbackDocs });
let countCalls = 0;
let premiumCountCalls = 0;
let premiumAggregateGet = async () => ({ data: () => ({ count: 4 }) });
let premiumFallbackGet = async () => ({ size: 0 });
let clock = 0;
let adminAuth = null;

const createRef = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
const snapshot = (ref) => ({ exists: documents.has(ref.key), data: () => documents.get(ref.key) || {} });
const db = {
  collection: (collectionName) => ({
    doc: (id) => createRef(collectionName, id),
    where: () => ({
      get: () => premiumFallbackGet(),
      count: () => ({
        get: async () => {
          premiumCountCalls += 1;
          return premiumAggregateGet();
        },
      }),
    }),
    count: () => ({
      get: async () => {
        countCalls += 1;
        return aggregateGet();
      },
    }),
    limit: () => ({ get: fallbackGet }),
  }),
  runTransaction: async (callback) =>
    callback({
      get: async (ref) => snapshot(ref),
      set: (ref, data, options) => {
        const previous = options?.merge ? documents.get(ref.key) || {} : {};
        documents.set(ref.key, { ...previous, ...data });
      },
    }),
};

require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: { getAdminDb: () => db, getAdminAuth: () => adminAuth, hasFirebaseAdminConfig: () => true },
};
delete require.cache[metricsPath];
const { countPremiumSubscriptions, countTotalAccounts, recordBillingMetricEvent } = require('./metrics');
const { handleMetricEvent, requiresAuthenticatedMetricEvent } = require('./metrics');
const { getDayKey } = require('./metricsValues');

const createResponse = () => {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(payload) {
      response.body = payload;
      return response;
    },
    end() {},
  };
  return response;
};

const createUnauthenticatedRequest = (event) => ({
  headers: {},
  body: { event, installationId: 'test-installation' },
});

const createAuthenticatedRequest = (event, installationId = 'test-installation') => ({
  headers: { authorization: 'Bearer test-token' },
  body: { event, installationId },
});

beforeEach(() => {
  documents.clear();
  aggregateGet = async () => ({ data: () => ({ count: 3 }) });
  fallbackDocs = [{}, {}];
  fallbackGet = async () => ({ docs: fallbackDocs });
  countCalls = 0;
  premiumCountCalls = 0;
  premiumAggregateGet = async () => ({ data: () => ({ count: 4 }) });
  premiumFallbackGet = async () => ({ size: 0 });
  adminAuth = null;
  clock += 10 * 60 * 1000;
  Date.now = () => clock;
});
after(() => {
  Date.now = originalDateNow;
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[metricsPath];
});

describe('recordBillingMetricEvent', () => {
  it('records a billing metric event', async () => {
    await recordBillingMetricEvent('premium_upgrade');
    await recordBillingMetricEvent('premium_upgrade');

    const dailyMetrics = [...documents.entries()].find(([key]) => key.startsWith('adminDailyMetrics/'))[1];
    assert.equal(dailyMetrics.upgrades, 2);
  });

  it('ignores billing metrics without a valid event type', async () => {
    await recordBillingMetricEvent('');
    assert.equal([...documents.keys()].some((key) => key.startsWith('adminDailyMetrics/')), false);
  });
});

describe('countTotalAccounts', () => {
  it('caches aggregate results and coalesces concurrent refreshes', async () => {
    let resolveAggregate;
    aggregateGet = () => new Promise((resolve) => {
      resolveAggregate = resolve;
    });

    const first = countTotalAccounts();
    const second = countTotalAccounts();
    assert.equal(countCalls, 1);
    resolveAggregate({ data: () => ({ count: 42 }) });
    assert.equal(await first, 42);
    assert.equal(await second, 42);

    assert.equal(await countTotalAccounts(), 42);
    assert.equal(countCalls, 1);
  });

  it('falls back when aggregate count is unavailable, including synchronous failures', async () => {
    aggregateGet = () => { throw new Error('aggregate unavailable'); };
    let resolveFallback;
    fallbackGet = () => new Promise((resolve) => {
      resolveFallback = resolve;
    });

    const first = countTotalAccounts();
    const second = countTotalAccounts();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(countCalls, 2);
    resolveFallback({ docs: fallbackDocs });
    assert.equal(await first, 2);
    assert.equal(await second, 2);
    assert.equal(countCalls, 2);
  });

  it('falls back when the aggregate result is not numeric', async () => {
    aggregateGet = async () => ({ data: () => ({ count: '42' }) });

    assert.equal(await countTotalAccounts(), 0);
    assert.equal(countCalls, 2);
  });
});

describe('countPremiumSubscriptions', () => {
  it('uses and caches the aggregate count while coalescing concurrent refreshes', async () => {
    let resolveAggregate;
    premiumAggregateGet = () => new Promise((resolve) => {
      resolveAggregate = resolve;
    });

    const first = countPremiumSubscriptions();
    const second = countPremiumSubscriptions();
    assert.equal(premiumCountCalls, 1);
    resolveAggregate({ data: () => ({ count: 4 }) });
    assert.equal(await first, 4);
    assert.equal(await second, 4);
    assert.equal(await countPremiumSubscriptions(), 4);
    assert.equal(premiumCountCalls, 1);
  });

  it('falls back to a filtered document count when aggregation is unavailable', async () => {
    premiumAggregateGet = () => { throw new Error('aggregate unavailable'); };
    premiumFallbackGet = async () => ({ size: 3, docs: [{}, {}, {}] });

    assert.equal(await countPremiumSubscriptions(), 3);
    assert.equal(premiumCountCalls, 1);
  });

  it('clears the in-flight request so a failed request can be retried', async () => {
    premiumAggregateGet = async () => { throw new Error('temporary failure'); };
    premiumFallbackGet = async () => { throw new Error('temporary failure'); };
    await assert.rejects(countPremiumSubscriptions(), /temporary failure/);
    premiumAggregateGet = async () => ({ data: () => ({ count: 5 }) });
    assert.equal(await countPremiumSubscriptions(), 5);
    assert.equal(premiumCountCalls, 2);
  });
});

describe('product metric authentication contract', () => {
  it('rejects every allowlisted product event without a verified identity', async () => {
    for (const eventType of [
      'account_signup',
      'account_signin',
      'cycle_saved',
      'discussion_saved',
      'verification_run',
      'cloud_cycle_saved',
      'cloud_cycle_loaded',
    ]) {
      const response = createResponse();

      await handleMetricEvent(createUnauthenticatedRequest(eventType), response);

      assert.equal(response.statusCode, 401, `${eventType} must require authentication`);
    }
  });

  it('performs no Firestore write for an unauthenticated event', async () => {
    const response = createResponse();

    await handleMetricEvent(createUnauthenticatedRequest('cycle_saved'), response);

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Authentication required for product metrics.' });
    assert.equal(documents.size, 0);
  });

  it('leaves billing webhook events out of the client-authenticated allowlist', () => {
    assert.equal(requiresAuthenticatedMetricEvent('premium_upgrade'), false);
    assert.equal(requiresAuthenticatedMetricEvent('premium_cancellation'), false);
  });

  it('does not classify unsupported events as trusted metric writes', () => {
    assert.equal(requiresAuthenticatedMetricEvent('unknown'), false);
  });
});

describe('daily active device dedupe limits', () => {
  it('counts at most five distinct devices per authenticated account per day', async () => {
    adminAuth = { verifyIdToken: async () => ({ uid: 'user-1' }) };

    for (let index = 1; index <= 6; index += 1) {
      const response = createResponse();
      await handleMetricEvent(createAuthenticatedRequest('cycle_saved', `installation-${index}`), response);
      assert.equal(response.statusCode, 204);
    }

    const dailyMetrics = documents.get(`adminDailyMetrics/${getDayKey()}`);
    const deviceDedupes = [...documents.entries()].filter(([key, data]) =>
      key.startsWith('adminMetricDedupes/') && data.kind === 'device'
    );
    assert.equal(deviceDedupes.length, 5);
    assert.equal(dailyMetrics.activeDevices, 5);
    assert.equal(documents.get(`adminMetricDedupes/account:${getDayKey()}:user-1`).deviceCount, 5);
  });

  it('keeps recording events and user progress after the device cap is reached', async () => {
    adminAuth = { verifyIdToken: async () => ({ uid: 'user-1' }) };

    for (let index = 1; index <= 6; index += 1) {
      await handleMetricEvent(createAuthenticatedRequest('cycle_saved', `installation-${index}`), createResponse());
    }
    await handleMetricEvent(createAuthenticatedRequest('cloud_cycle_loaded', 'installation-7'), createResponse());

    assert.equal(documents.get('userMetrics/user-1').cyclesCreated, 6);
    const dailyMetrics = documents.get(`adminDailyMetrics/${getDayKey()}`);
    assert.equal(dailyMetrics.cloudLoads, 1);
    assert.equal(dailyMetrics.activeDevices, 5);
  });

  it('keeps identical client ids separate across authenticated accounts', async () => {
    adminAuth = { verifyIdToken: async () => ({ uid: 'user-1' }) };
    await handleMetricEvent(createAuthenticatedRequest('cycle_saved', 'shared-id'), createResponse());
    adminAuth = { verifyIdToken: async () => ({ uid: 'user-2' }) };
    await handleMetricEvent(createAuthenticatedRequest('cycle_saved', 'shared-id'), createResponse());

    const deviceDedupes = [...documents.entries()].filter(([key, data]) =>
      key.startsWith('adminMetricDedupes/') && data.kind === 'device'
    );
    assert.equal(deviceDedupes.length, 2);
    assert.deepEqual(deviceDedupes.map(([, data]) => data.uid).sort(), ['user-1', 'user-2']);
    assert.equal(documents.get(`adminDailyMetrics/${getDayKey()}`).activeDevices, 2);
  });
});

describe('product metric live summary', () => {
  it('records the event when an optional live headline lookup fails', async () => {
    adminAuth = { verifyIdToken: async () => ({ uid: 'user-1' }) };
    premiumAggregateGet = async () => {
      throw new Error('aggregation unavailable');
    };
    premiumFallbackGet = async () => {
      throw new Error('fallback unavailable');
    };

    const dayKey = getDayKey();
    documents.set(`adminDailyMetrics/${dayKey}`, {
      cloudSaves: 2,
      premiumSubscriptions: 7,
    });

    const response = createResponse();
    await handleMetricEvent(createAuthenticatedRequest('cloud_cycle_saved'), response);

    assert.equal(response.statusCode, 204);
    const dailyMetrics = [...documents.entries()].find(([key]) =>
      key.startsWith('adminDailyMetrics/')
    )?.[1];
    assert.equal(dailyMetrics.cloudSaves, 3);
    // A failed lookup leaves the stored total untouched instead of resetting to zero or rejecting the event.
    assert.equal(dailyMetrics.premiumSubscriptions, 7);
    // The independent storage lookup still lands instead of being discarded.
    assert.equal(typeof dailyMetrics.storageBytes, 'number');
    assert.ok(dailyMetrics.storageBytes > 0);
  });
});
