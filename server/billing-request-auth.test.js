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
  assert.deepEqual(response.body, { error: 'Firebase Admin is not configured on this deployment.' });
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
  assert.deepEqual(response.body, { error: 'Missing Firebase ID token.' });
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
  assert.deepEqual(response.body, { error: 'Invalid Firebase ID token.' });
});
