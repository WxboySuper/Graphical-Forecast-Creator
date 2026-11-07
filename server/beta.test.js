'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const firebaseAdminPath = require.resolve('./firebase-admin');
const betaPath = require.resolve('./beta');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const originalModuleLoad = Module._load;
const documents = new Map();
const originalInviteToken = process.env.BETA_INVITE_TOKEN;

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

const verifyCalls = [];
let verifiedUid = 'user-1';
const adminAuth = {
  verifyIdToken: async (token, checkRevoked) => {
    verifyCalls.push({ token, checkRevoked });
    if (token !== 'valid-token') throw new Error('invalid token');
    return { uid: verifiedUid };
  },
};

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
  exports: { getAdminDb: () => db, getAdminAuth: () => adminAuth, hasFirebaseAdminConfig: () => true },
};

Module._load = function load(request, parent, isMain) {
  if (request === 'express-rate-limit') return () => () => undefined;
  return originalModuleLoad.call(this, request, parent, isMain);
};

delete require.cache[betaPath];
const { __testing } = require('./beta');

beforeEach(() => {
  documents.clear();
  verifyCalls.length = 0;
  verifiedUid = 'user-1';
  process.env.BETA_MODE = 'true';
  process.env.BETA_INVITE_TOKEN = 'test-invite-token';
});

after(() => {
  delete process.env.BETA_MODE;
  Module._load = originalModuleLoad;
  if (originalInviteToken === undefined) delete process.env.BETA_INVITE_TOKEN;
  else process.env.BETA_INVITE_TOKEN = originalInviteToken;
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[betaPath];
});

describe('beta invite token comparison', () => {
  it('accepts the configured token', () => {
    assert.equal(__testing.isValidInviteToken('test-invite-token'), true);
  });

  it('rejects the same-length token with a different byte', () => {
    assert.equal(__testing.isValidInviteToken('test-invite-tokeX'), false);
  });

  it('rejects shorter and longer tokens without throwing', () => {
    assert.equal(__testing.isValidInviteToken('test-invite'), false);
    assert.equal(__testing.isValidInviteToken('test-invite-token-plus'), false);
  });

  it('rejects empty and non-string values', () => {
    assert.equal(__testing.isValidInviteToken(''), false);
    assert.equal(__testing.isValidInviteToken(undefined), false);
    assert.equal(__testing.isValidInviteToken(null), false);
    assert.equal(__testing.isValidInviteToken(42), false);
    assert.equal(__testing.isValidInviteToken({ token: 'test-invite-token' }), false);
  });
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

describe('beta claim deleted-account guard', () => {
  const createResponse = () => {
    const response = { statusCode: null, body: null };
    response.status = (code) => {
      response.statusCode = code;
      return response;
    };
    response.json = (body) => {
      response.body = body;
      return response;
    };
    return response;
  };
  const createRequest = () => ({
    headers: { authorization: 'Bearer valid-token' },
    body: { token: 'test-invite-token' },
  });

  it('verifies the ID token with revocation checking enabled', async () => {
    const response = createResponse();
    await __testing.handleBetaClaim(createRequest(), response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(verifyCalls, [{ token: 'valid-token', checkRevoked: true }]);
    assert.equal(documents.get('userEntitlements/user-1').premiumActive, true);
  });

  it('refuses to recreate beta state while account deletion is in progress', async () => {
    documents.set('accountDeletionRequests/user-1', { status: 'pending' });
    const response = createResponse();
    await __testing.handleBetaClaim(createRequest(), response);

    assert.equal(response.statusCode, 409);
    assert.equal(documents.has('userEntitlements/user-1'), false);
    assert.equal(documents.has('userProfiles/user-1'), false);
  });

  it('refuses to recreate beta state after account deletion completed', async () => {
    const { getDeletionTombstoneId } = require('./account-lifecycle');
    documents.set(`accountDeletionTombstones/${getDeletionTombstoneId('user-1')}`, { deletedAt: 'x' });
    const response = createResponse();
    await __testing.handleBetaClaim(createRequest(), response);

    assert.equal(response.statusCode, 409);
    assert.equal(documents.has('userEntitlements/user-1'), false);
  });
});
