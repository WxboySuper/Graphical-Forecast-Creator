'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const firebaseAdminPath = require.resolve('./firebase-admin');
const betaPath = require.resolve('./beta');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const originalModuleLoad = Module._load;
const documents = new Map();

const createRef = (collection, id) => ({
  key: `${collection}/${id}`,
  get: async () => ({
    exists: documents.has(`${collection}/${id}`),
    data: () => documents.get(`${collection}/${id}`) || {},
  }),
  set: async (data, options) => {
    const previous = options?.merge ? documents.get(`${collection}/${id}`) || {} : {};
    documents.set(`${collection}/${id}`, { ...previous, ...data });
  },
});

const db = {
  collection: (collection) => ({
    doc: (id) => createRef(collection, id),
  }),
  runTransaction: async (callback) => {
    const writes = [];
    await callback({
      get: async (ref) => ({
        exists: documents.has(ref.key),
        data: () => documents.get(ref.key) || {},
      }),
      set: (ref, data, options) => writes.push({ ref, data, options }),
    });
    for (const write of writes) {
      const previous = write.options?.merge ? documents.get(write.ref.key) || {} : {};
      documents.set(write.ref.key, { ...previous, ...write.data });
    }
  },
};

require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: { getAdminDb: () => db },
};

Module._load = function load(request, parent, isMain) {
  if (request === 'express-rate-limit') return () => () => undefined;
  return originalModuleLoad.call(this, request, parent, isMain);
};

delete require.cache[betaPath];
const { __testing } = require('./beta');

beforeEach(() => {
  documents.clear();
});

after(() => {
  Module._load = originalModuleLoad;
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[betaPath];
});

describe('beta entitlement grants', () => {
  it('activates premium while preserving existing Stripe entitlement fields', async () => {
    const startedAt = Date.now();
    documents.set('userProfiles/user-1', {
      betaGrantedAt: 'existing-date',
      betaInviteSource: 'existing-source',
    });
    documents.set('userEntitlements/user-1', {
      uid: 'user-1',
      billingStatus: 'inactive',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
      planInterval: 'month',
    });

    await __testing.grantBetaAccess('user-1');

    assert.deepEqual(documents.get('userProfiles/user-1'), {
      betaGrantedAt: 'existing-date',
      betaInviteSource: 'existing-source',
      betaAccess: true,
    });
    const { updatedAt, ...entitlementWithoutTimestamp } = documents.get('userEntitlements/user-1');
    assert.deepEqual(entitlementWithoutTimestamp, {
      uid: 'user-1',
      billingStatus: 'inactive',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
      planInterval: 'month',
      betaOverrideActive: true,
      premiumActive: true,
      effectiveSource: 'beta_override',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    assert.ok(updatedAt instanceof Date);
    assert.ok(updatedAt.getTime() >= startedAt);
    assert.ok(updatedAt.getTime() <= Date.now());
  });

  it('repairs an entitlement when the profile was already granted beta access', async () => {
    documents.set('userProfiles/user-2', {
      betaAccess: true,
      betaGrantedAt: 'existing-date',
      betaInviteSource: 'existing-source',
    });
    documents.set('userEntitlements/user-2', {
      uid: 'user-2',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
    });

    await __testing.grantBetaAccess('user-2');

    assert.deepEqual(documents.get('userProfiles/user-2'), {
      betaAccess: true,
      betaGrantedAt: 'existing-date',
      betaInviteSource: 'existing-source',
    });
    const { updatedAt, ...entitlementWithoutTimestamp } = documents.get('userEntitlements/user-2');
    assert.deepEqual(entitlementWithoutTimestamp, {
      uid: 'user-2',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
      betaOverrideActive: true,
      premiumActive: true,
      effectiveSource: 'beta_override',
      planInterval: null,
      billingStatus: 'inactive',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    assert.ok(updatedAt instanceof Date);
  });
});
