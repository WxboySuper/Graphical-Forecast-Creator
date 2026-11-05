'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { verifyRequestUser } = require('./billingRequestAuth');

const NOT_CONFIGURED_ERROR = 'Firebase Admin is not configured on this deployment.';
const MISSING_TOKEN_ERROR = 'Missing Firebase ID token.';
const INVALID_TOKEN_ERROR = 'Invalid Firebase ID token.';
const FIREBASE_ENV_KEYS = [
  'FIREBASE_ADMIN_PROJECT_ID',
  'FIREBASE_ADMIN_CLIENT_EMAIL',
  'FIREBASE_ADMIN_PRIVATE_KEY',
];

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

/** Asserts a rejection wrote the expected status and error payload. */
const assertRejection = (result, response, expected) => {
  assert.equal(result, null);
  assert.equal(response.statusCode, expected.statusCode);
  assert.deepStrictEqual(response.body, { error: expected.error });
};

/** Asserts a successful verification left the response untouched. */
const assertUntouchedResponse = (response) => {
  assert.equal(response.statusCode, null);
  assert.equal(response.body, null);
};

/** Builds an auth stub that fails the test if verification is attempted. */
const createUnreachableVerifier = (message) => ({
  verifyIdToken: async () => {
    throw new Error(message);
  },
});

/** Builds an auth stub that records the token and resolves the given user. */
const createTokenVerifier = (user, onToken) => ({
  verifyIdToken: async (token) => {
    onToken(token);
    return user;
  },
});

/** Runs the callback with Firebase Admin env config removed, then restores it. */
const withFirebaseEnvCleared = async (fn) => {
  const saved = new Map(FIREBASE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of FIREBASE_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    await fn();
  } finally {
    for (const key of FIREBASE_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

/** Runs one rejection case and checks the shared 503/401 outcome. */
const runRejectionCase = async (request, overrides, expected) => {
  const response = createResponse();
  const result = await verifyRequestUser(request, response, overrides);
  assertRejection(result, response, expected);
};

/** Runs one success case, captures the verified token, and checks the response. */
const runValidTokenCase = async ({ request, token, uid, expectedToken }) => {
  const response = createResponse();
  const expectedUser = { uid };
  let receivedToken = null;
  const adminAuth = createTokenVerifier(expectedUser, (seenToken) => {
    receivedToken = seenToken;
  });
  const overrides =
    token === undefined ? { adminAuth, hasConfig: true } : { adminAuth, hasConfig: true, token };

  const result = await verifyRequestUser(request, response, overrides);

  assert.deepStrictEqual(result, expectedUser);
  assert.equal(receivedToken, expectedToken);
  assertUntouchedResponse(response);
};

const rejectionCases = [
  {
    name: 'rejects billing requests when Firebase Admin is unavailable',
    request: { headers: {} },
    buildOverrides: () => ({ adminAuth: null, hasConfig: false, token: '' }),
    expected: { statusCode: 503, error: NOT_CONFIGURED_ERROR },
  },
  {
    name: 'uses production defaults to reject unconfigured deployments with 503',
    request: { headers: {} },
    clearEnv: true,
    buildOverrides: () => undefined,
    expected: { statusCode: 503, error: NOT_CONFIGURED_ERROR },
  },
  {
    name: 'rejects billing requests when config is missing but auth is present',
    request: { headers: {} },
    buildOverrides: () => ({
      adminAuth: createUnreachableVerifier('verifyIdToken must not be called when config is missing'),
      hasConfig: false,
      token: 'valid-token',
    }),
    expected: { statusCode: 503, error: NOT_CONFIGURED_ERROR },
  },
  {
    name: 'rejects billing requests when auth is missing but config is present',
    request: { headers: {} },
    buildOverrides: () => ({ adminAuth: null, hasConfig: true, token: 'valid-token' }),
    expected: { statusCode: 503, error: NOT_CONFIGURED_ERROR },
  },
  {
    name: 'rejects billing requests without an ID token',
    request: { headers: {} },
    buildOverrides: () => ({
      adminAuth: createUnreachableVerifier('verifyIdToken must not be called without a token'),
      hasConfig: true,
      token: '',
    }),
    expected: { statusCode: 401, error: MISSING_TOKEN_ERROR },
  },
  {
    name: 'rejects billing requests with an invalid ID token',
    request: { headers: {} },
    buildOverrides: () => ({
      adminAuth: createUnreachableVerifier('invalid token'),
      hasConfig: true,
      token: 'bad-token',
    }),
    expected: { statusCode: 401, error: INVALID_TOKEN_ERROR },
  },
];

for (const rejectionCase of rejectionCases) {
  test(rejectionCase.name, async () => {
    if (rejectionCase.clearEnv) {
      await withFirebaseEnvCleared(async () => {
        await runRejectionCase(
          rejectionCase.request,
          rejectionCase.buildOverrides(),
          rejectionCase.expected
        );
      });
    } else {
      await runRejectionCase(
        rejectionCase.request,
        rejectionCase.buildOverrides(),
        rejectionCase.expected
      );
    }
  });
}

const validTokenCases = [
  {
    name: 'returns the verified user for a valid ID token',
    request: { headers: {} },
    token: 'valid-token',
    uid: 'user-123',
    expectedToken: 'valid-token',
  },
  {
    name: 'uses the Authorization bearer token when no token override is injected',
    request: { headers: { authorization: 'Bearer bearer-token-abc' } },
    token: undefined,
    uid: 'bearer-user-123',
    expectedToken: 'bearer-token-abc',
  },
];

for (const validTokenCase of validTokenCases) {
  test(validTokenCase.name, async () => {
    await runValidTokenCase(validTokenCase);
  });
}
