'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { verifyRequestUser } = require('./billingRequestAuth');

/** Creates the small Express response surface used by billing auth. */
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
  };
  return response;
};

test('rejects billing requests when Firebase Admin is unavailable', async () => {
  const response = createResponse();

  const result = await verifyRequestUser({ headers: {} }, response, {
    adminAuth: null,
    hasConfig: false,
    token: '',
  });

  assert.equal(result, null);
  assert.equal(response.statusCode, 503);
  assert.deepStrictEqual(response.body, { error: 'Firebase Admin is not configured on this deployment.' });
});

test('uses production defaults to reject unconfigured deployments with 503', async () => {
  const projectIdKey = 'FIREBASE_ADMIN_PROJECT_ID';
  const clientEmailKey = 'FIREBASE_ADMIN_CLIENT_EMAIL';
  const privateKeyKey = 'FIREBASE_ADMIN_PRIVATE_KEY';
  const savedProjectId = process.env[projectIdKey];
  const savedClientEmail = process.env[clientEmailKey];
  const savedPrivateKey = process.env[privateKeyKey];
  delete process.env[projectIdKey];
  delete process.env[clientEmailKey];
  delete process.env[privateKeyKey];

  try {
    const response = createResponse();

    const result = await verifyRequestUser({ headers: {} }, response);

    assert.equal(result, null);
    assert.equal(response.statusCode, 503);
    assert.deepStrictEqual(response.body, { error: 'Firebase Admin is not configured on this deployment.' });
  } finally {
    if (savedProjectId === undefined) {
      delete process.env[projectIdKey];
    } else {
      process.env[projectIdKey] = savedProjectId;
    }
    if (savedClientEmail === undefined) {
      delete process.env[clientEmailKey];
    } else {
      process.env[clientEmailKey] = savedClientEmail;
    }
    if (savedPrivateKey === undefined) {
      delete process.env[privateKeyKey];
    } else {
      process.env[privateKeyKey] = savedPrivateKey;
    }
  }
});

test('rejects billing requests when config is missing but auth is present', async () => {
  const response = createResponse();
  const adminAuth = {
    verifyIdToken: async () => {
      throw new Error('verifyIdToken must not be called when config is missing');
    },
  };

  const result = await verifyRequestUser({ headers: {} }, response, {
    adminAuth,
    hasConfig: false,
    token: 'valid-token',
  });

  assert.equal(result, null);
  assert.equal(response.statusCode, 503);
  assert.deepStrictEqual(response.body, { error: 'Firebase Admin is not configured on this deployment.' });
});

test('rejects billing requests when auth is missing but config is present', async () => {
  const response = createResponse();

  const result = await verifyRequestUser({ headers: {} }, response, {
    adminAuth: null,
    hasConfig: true,
    token: 'valid-token',
  });

  assert.equal(result, null);
  assert.equal(response.statusCode, 503);
  assert.deepStrictEqual(response.body, { error: 'Firebase Admin is not configured on this deployment.' });
});

test('rejects billing requests without an ID token', async () => {
  const response = createResponse();
  const adminAuth = {
    verifyIdToken: async () => {
      throw new Error('verifyIdToken must not be called without a token');
    },
  };

  const result = await verifyRequestUser({ headers: {} }, response, {
    adminAuth,
    hasConfig: true,
    token: '',
  });

  assert.equal(result, null);
  assert.equal(response.statusCode, 401);
  assert.deepStrictEqual(response.body, { error: 'Missing Firebase ID token.' });
});

test('rejects billing requests with an invalid ID token', async () => {
  const response = createResponse();
  const adminAuth = {
    verifyIdToken: async () => {
      throw new Error('invalid token');
    },
  };

  const result = await verifyRequestUser({ headers: {} }, response, {
    adminAuth,
    hasConfig: true,
    token: 'bad-token',
  });

  assert.equal(result, null);
  assert.equal(response.statusCode, 401);
  assert.deepStrictEqual(response.body, { error: 'Invalid Firebase ID token.' });
});

test('returns the verified user for a valid ID token', async () => {
  const response = createResponse();
  const expectedUser = { uid: 'user-123' };
  let receivedToken = null;
  const adminAuth = {
    verifyIdToken: async (token) => {
      receivedToken = token;
      return expectedUser;
    },
  };

  const result = await verifyRequestUser({ headers: {} }, response, {
    adminAuth,
    hasConfig: true,
    token: 'valid-token',
  });

  assert.deepStrictEqual(result, expectedUser);
  assert.equal(receivedToken, 'valid-token');
  assert.equal(response.statusCode, null);
  assert.equal(response.body, null);
});

test('uses the Authorization bearer token when no token override is injected', async () => {
  const response = createResponse();
  const expectedUser = { uid: 'bearer-user-123' };
  let receivedToken = null;
  const adminAuth = {
    verifyIdToken: async (token) => {
      receivedToken = token;
      return expectedUser;
    },
  };

  const result = await verifyRequestUser(
    { headers: { authorization: 'Bearer bearer-token-abc' } },
    response,
    { adminAuth, hasConfig: true }
  );

  assert.deepStrictEqual(result, expectedUser);
  assert.equal(receivedToken, 'bearer-token-abc');
  assert.equal(response.statusCode, null);
  assert.equal(response.body, null);
});
