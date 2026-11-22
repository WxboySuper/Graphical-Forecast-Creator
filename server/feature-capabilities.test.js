'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CUSTOM_PRODUCTS_CAPABILITY,
  ensureCustomProductsCapability,
  ensureCustomProductsCapabilityAtStartup,
} = require('./feature-capabilities');

const createDb = () => {
  const writes = [];
  return {
    writes,
    collection(name) {
      assert.equal(name, 'serverFeatureCapabilities');
      return {
        doc(id) {
          assert.equal(id, CUSTOM_PRODUCTS_CAPABILITY);
          return {
            async set(value, options) {
              writes.push({ value, options });
            },
          };
        },
      };
    },
  };
};

test('enables the server-owned Custom Products capability', async () => {
  const db = createDb();

  const result = await ensureCustomProductsCapability({ db });

  assert.deepEqual(result, { enabled: true, skipped: false });
  assert.deepEqual(db.writes, [{ value: { enabled: true }, options: { merge: true } }]);
});

test('skips capability reconciliation when Firebase Admin is not configured', async () => {
  assert.deepEqual(await ensureCustomProductsCapability({ db: null }), { enabled: false, skipped: true });
});

test('startup reconciliation reports success without logging', async () => {
  const db = createDb();
  const errors = [];
  const log = { error: (...args) => errors.push(args) };

  const result = await ensureCustomProductsCapabilityAtStartup({ db, log });

  assert.deepEqual(result, { enabled: true, skipped: false });
  assert.deepEqual(db.writes, [{ value: { enabled: true }, options: { merge: true } }]);
  assert.deepEqual(errors, []);
});

test('startup reconciliation keeps boot alive when the capability write fails', async () => {
  const failure = new Error('firestore unavailable');
  const db = {
    collection() {
      return {
        doc() {
          return {
            async set() {
              throw failure;
            },
          };
        },
      };
    },
  };
  const errors = [];
  const log = { error: (...args) => errors.push(args) };

  const result = await ensureCustomProductsCapabilityAtStartup({ db, log });

  assert.deepEqual(result, { enabled: false, skipped: false, error: failure });
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /continuing startup/);
  assert.equal(errors[0][1], failure);
});
