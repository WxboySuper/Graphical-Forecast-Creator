'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const metricsPath = require.resolve('./metrics');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const documents = new Map();

const createRef = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
const snapshot = (ref) => ({ exists: documents.has(ref.key), data: () => documents.get(ref.key) || {} });
const db = {
  collection: (collection) => ({
    doc: (id) => createRef(collection, id),
    where: () => ({ get: async () => ({ size: 0 }) }),
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
  exports: { getAdminDb: () => db, getAdminAuth: () => null, hasFirebaseAdminConfig: () => true },
};
delete require.cache[metricsPath];
const { recordBillingMetricEvent } = require('./metrics');

beforeEach(() => documents.clear());
after(() => {
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[metricsPath];
});

describe('recordBillingMetricEvent', () => {
  it('counts a replayed Stripe event id only once', async () => {
    assert.equal(await recordBillingMetricEvent('premium_upgrade', 'evt_upgrade'), true);
    assert.equal(await recordBillingMetricEvent('premium_upgrade', 'evt_upgrade'), false);

    const dailyMetrics = [...documents.entries()].find(([key]) => key.startsWith('adminDailyMetrics/'))[1];
    assert.equal(dailyMetrics.upgrades, 1);
    assert.equal(documents.get('processedBillingWebhookEvents/evt_upgrade').eventType, 'premium_upgrade');
  });

  it('rejects billing metrics without a delivery id', async () => {
    assert.equal(await recordBillingMetricEvent('premium_cancellation', ''), false);
    assert.equal([...documents.keys()].some((key) => key.startsWith('adminDailyMetrics/')), false);
  });
});
