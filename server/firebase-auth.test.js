'use strict';

const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');

const firebaseAdminPath = require.resolve('./firebase-admin');
const firebaseAuthPath = require.resolve('./firebase-auth');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const originalFirebaseAuth = require.cache[firebaseAuthPath];

const adminAuth = {
  verifyIdToken: async (token, checkRevoked) => ({ uid: `uid-for-${token}`, checkRevoked }),
};

require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: { getAdminAuth: () => adminAuth },
};
delete require.cache[firebaseAuthPath];
const { getBearerToken, verifyFirebaseToken } = require('./firebase-auth');

after(() => {
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  if (originalFirebaseAuth) require.cache[firebaseAuthPath] = originalFirebaseAuth;
  else delete require.cache[firebaseAuthPath];
});

describe('getBearerToken', () => {
  it('returns the token from a Bearer authorization header', () => {
    assert.equal(getBearerToken({ headers: { authorization: 'Bearer abc123' } }), 'abc123');
  });

  it('returns an empty string for missing or non-Bearer headers', () => {
    assert.equal(getBearerToken(), '');
    assert.equal(getBearerToken({ headers: {} }), '');
    assert.equal(getBearerToken({ headers: { authorization: 'Basic abc123' } }), '');
  });
});

describe('verifyFirebaseToken', () => {
  it('returns the decoded token and passes the default revoked-token setting', async () => {
    await assert.doesNotReject(async () => {
      const decoded = await verifyFirebaseToken({ headers: { authorization: 'Bearer abc123' } });
      assert.deepEqual(decoded, { uid: 'uid-for-abc123', checkRevoked: false });
    });
  });

  it('passes checkRevoked to Firebase verification', async () => {
    const decoded = await verifyFirebaseToken({ headers: { authorization: 'Bearer abc123' } }, true);
    assert.deepEqual(decoded, { uid: 'uid-for-abc123', checkRevoked: true });
  });

  it('returns null when credentials are missing', async () => {
    assert.equal(await verifyFirebaseToken({ headers: {} }), null);
  });

  it('returns null when Firebase rejects the token', async () => {
    const rejectingAuth = { verifyIdToken: async () => { throw new Error('invalid token'); } };
    assert.equal(await verifyFirebaseToken({ headers: { authorization: 'Bearer invalid' } }, false, rejectingAuth), null);
  });
});
