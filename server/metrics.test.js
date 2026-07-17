'use strict';

const { after, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const metricsPath = require.resolve('./metrics');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const documents = new Map();

const createRef = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
const getSnapshot = (ref) => {
  const data = documents.get(ref.key);
  return { exists: Boolean(data), data: () => data || {} };
};
const db = {
  collection: (collection) => ({
    doc: (id) => createRef(collection, id),
    where: () => ({ get: async () => ({ size: 0 }) }),
  }),
  runTransaction: async (callback) =>
    callback({
      get: async (ref) => getSnapshot(ref),
      set: (ref, data, options) => {
        documents.set(ref.key, options?.merge ? { ...(documents.get(ref.key) || {}), ...data } : data);
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

after(() => {
  documents.clear();
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[metricsPath];
});

describe('recordBillingMetricEvent', () => {
  it('records each Stripe webhook event id only once', async () => {
    const first = await recordBillingMetricEvent('premium_upgrade', 'evt_checkout_123');
    const replay = await recordBillingMetricEvent('premium_upgrade', 'evt_checkout_123');
    const dailyMetrics = [...documents.entries()].find(([key]) => key.startsWith('adminDailyMetrics/'))?.[1];

    assert.equal(first, true);
    assert.equal(replay, false);
    assert.equal(dailyMetrics.upgrades, 1);
    assert.equal(documents.get('processedBillingWebhookEvents/evt_checkout_123').eventType, 'premium_upgrade');
  });

  it('counts distinct cancellation events and rejects missing event ids', async () => {
    const accepted = await recordBillingMetricEvent('premium_cancellation', 'evt_cancel_456');
    const missingId = await recordBillingMetricEvent('premium_cancellation', '');
    const dailyMetrics = [...documents.entries()].find(([key]) => key.startsWith('adminDailyMetrics/'))?.[1];

    assert.equal(accepted, true);
    assert.equal(missingId, false);
    assert.equal(dailyMetrics.cancellations, 1);
  });
});
