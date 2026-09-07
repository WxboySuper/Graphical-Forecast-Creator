const assert = require('node:assert/strict');
const { test } = require('node:test');
const { verifyRequestUser } = require('./billingRequestAuth');

test('rejects billing requests when Firebase Admin is unavailable', async () => {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };

  const result = await verifyRequestUser({ headers: {} }, response);

  assert.equal(result, null);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: 'Firebase Admin is not configured on this deployment.' });
});
