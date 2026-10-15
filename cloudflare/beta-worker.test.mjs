import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker, { __test } from './beta-worker.mjs';
import { verifyToken } from '@clerk/backend';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const createToken = () => {
  const now = Math.floor(Date.now() / 1000);
  const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
    iss: 'https://test.clerk.accounts.dev', sub: 'user_beta_test', sid: 'sess_beta_test',
    iat: now, nbf: now - 1, exp: now + 300, azp: 'https://beta.gfcweather.com',
  })}`;
  return `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
};

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql.replace(/\s+/g, ' ').trim(); this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() { return this.database.first(this.sql, this.params); }
  async all() { return this.database.all(this.sql, this.params); }
  async run() { return this.database.run(this.sql, this.params); }
}

class D1Mock {
  constructor() {
    this.users = new Map();
    this.settings = new Map();
    this.records = new Map();
    this.entitlements = new Map();
    this.metrics = new Map();
    this.cloudCycles = new Map();
    this.workflowAwareness = new Map();
    this.customProducts = new Map();
    this.stripeEvents = new Set();
    this.metricEvents = new Set();
    this.billingCleanupQueue = new Map();
  }
  prepare(sql) { return new D1Statement(this, sql); }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
  async first(sql, params) {
    if (sql.startsWith('SELECT * FROM users WHERE clerk_id')) return this.users.get(params[0]) || null;
    if (sql.startsWith('SELECT beta_access FROM users WHERE clerk_id')) {
      const user = this.users.get(params[0]);
      return user ? { beta_access: user.beta_access } : null;
    }
    if (sql.startsWith('SELECT clerk_id FROM users WHERE email')) {
      const user = [...this.users.values()].find((entry) => entry.email.toLowerCase() === String(params[0]).toLowerCase());
      return user ? { clerk_id: user.clerk_id } : null;
    }
    if (sql.startsWith('SELECT data_json FROM user_settings')) return this.settings.has(params[0]) ? { data_json: this.settings.get(params[0]) } : null;
    if (sql.startsWith('SELECT data_json FROM user_entitlements')) return this.entitlements.has(params[0]) ? { data_json: this.entitlements.get(params[0]) } : null;
    if (sql.startsWith('SELECT data_json FROM user_metrics')) return this.metrics.has(params[0]) ? { data_json: this.metrics.get(params[0]) } : null;
    if (sql.startsWith('SELECT record_id, data_json, created_at, updated_at FROM user_records') && sql.includes('record_id = ?')) {
      return this.records.get(`${params[0]}:${params[1]}:${params[2]}`) || null;
    }
    if (sql.startsWith('SELECT clerk_id, legacy_uid FROM users WHERE legacy_uid')) {
      const user = [...this.users.values()].find((entry) => entry.legacy_uid === params[0]);
      return user ? { clerk_id: user.clerk_id, legacy_uid: user.legacy_uid } : null;
    }
    if (sql.startsWith('SELECT clerk_id FROM users WHERE legacy_uid')) {
      const user = [...this.users.values()].find((entry) => entry.legacy_uid === params[0]);
      return user ? { clerk_id: user.clerk_id } : null;
    }
    if (sql.startsWith('SELECT id FROM cloud_cycles WHERE id = ? AND user_id = ?')) {
      return this.cloudCycles.get(`${params[1]}:${params[0]}`) || null;
    }
    if (sql.startsWith('SELECT 1 AS found FROM cloud_cycles WHERE user_id = ? AND id = ?')) {
      return this.cloudCycles.has(`${params[0]}:${params[1]}`) ? { found: 1 } : null;
    }
    if (sql.startsWith('SELECT COUNT(*) AS count FROM cloud_cycles')) {
      return { count: [...this.cloudCycles.values()].filter((row) => row.user_id === params[0]).length };
    }
    if (sql.startsWith('SELECT COUNT(*) AS count FROM users')) return { count: this.users.size };
    if (sql.startsWith('SELECT COUNT(*) AS count FROM user_entitlements')) return { count: 0 };
    if (sql.startsWith('SELECT * FROM cloud_cycles WHERE id = ? AND user_id = ?')) {
      return this.cloudCycles.get(`${params[1]}:${params[0]}`) || null;
    }
    if (sql.startsWith('SELECT slot_id, data_json FROM custom_products WHERE user_id = ?')) {
      return [...this.customProducts.values()].find((row) => row.user_id === params[0] && row.product_id === params[1]) || null;
    }
    if (sql.startsWith('SELECT event_date, COUNT(*)')) return { results: [] };
    if (sql.startsWith('SELECT COUNT(*) AS total FROM product_metric_events')) return { total: this.metricEvents.size };
    if (sql.startsWith('SELECT COUNT(*) AS users FROM users')) return { users: this.users.size };
    if (sql.startsWith('SELECT COALESCE(SUM(payload_bytes), 0) AS bytes FROM cloud_cycles')) {
      return { bytes: [...this.cloudCycles.values()].reduce((sum, row) => sum + (row.payload_bytes || 0), 0) };
    }
    if (sql.startsWith('SELECT event_id FROM stripe_events')) return this.stripeEvents.has(params[0]) ? { event_id: params[0] } : null;
    return null;
  }
  async all(sql, params) {
    if (sql.startsWith('SELECT record_id, data_json, created_at, updated_at FROM user_records')) {
      const [, userId, type] = [null, params[0], params[1]];
      return { results: [...this.records.values()].filter((record) => record.user_id === userId && record.record_type === type) };
    }
    if (sql.includes('FROM cloud_cycles WHERE user_id = ?')) {
      return { results: [...this.cloudCycles.values()].filter((row) => row.user_id === params[0])
        .map((row) => ({ ...row, userId: row.user_id, cycleDate: row.cycle_date, createdAt: row.created_at, updatedAt: row.updated_at })) };
    }
    if (sql.includes('FROM workflow_awareness WHERE user_id = ?')) {
      return { results: [...this.workflowAwareness.values()].filter((row) => row.user_id === params[0])
        .map((row) => ({ id: row.cycle_id, data_json: row.data_json })) };
    }
    if (sql.startsWith('SELECT * FROM custom_products WHERE user_id = ?')) {
      return { results: [...this.customProducts.values()].filter((row) => row.user_id === params[0]) };
    }
    if (sql.startsWith('SELECT data_json FROM custom_products WHERE user_id = ?')) {
      return { results: [...this.customProducts.values()].filter((row) => row.user_id === params[0]).map((row) => ({ data_json: row.data_json })) };
    }
    if (sql.startsWith('SELECT stripe_customer_id, attempts FROM billing_cleanup_queue')) {
      return { results: [...this.billingCleanupQueue.values()].map(({ customer_id, attempts = 0 }) => ({ stripe_customer_id: customer_id, attempts })) };
    }
    return { results: [] };
  }
  async run(sql, params) {
    let changes = 1;
    if (sql.startsWith('INSERT INTO users')) {
      const [clerk_id, email, legacy_uid, display_name, beta_access, migration_status, created_at, updated_at] = params;
      this.users.set(clerk_id, { clerk_id, email, legacy_uid, email_verified: 1, display_name, beta_access, migration_status, created_at, updated_at });
    } else if (sql.startsWith('UPDATE users SET migration_status = ?, migrated_at')) {
      const [migration_status, migrated_at, updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { migration_status, migrated_at, updated_at });
    } else if (sql.startsWith('UPDATE users SET migration_status')) {
      const migration_status = params[0];
      const clerk_id = params.at(-1);
      const updated_at = params.at(-2);
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, {
        migration_status, updated_at,
        ...(sql.includes('legacy_uid = COALESCE') ? { legacy_uid: user.legacy_uid || params[1], ...(params[2] === 1 ? { beta_access: 1 } : {}) } : {}),
      });
    } else if (sql.startsWith('UPDATE users SET email')) {
      const [email, updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { email, updated_at, email_verified: 1 });
    } else if (sql.startsWith('UPDATE users SET beta_access')) {
      const [updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { beta_access: 1, updated_at });
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_settings') || sql.startsWith('INSERT INTO user_settings')) {
      if (sql.includes('ON CONFLICT')) {
        const existing = JSON.parse(this.settings.get(params[0]) || '{}');
        this.settings.set(params[0], JSON.stringify({ ...JSON.parse(params[1]), ...existing }));
      } else if (!this.settings.has(params[0])) this.settings.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_entitlements') || sql.startsWith('INSERT INTO user_entitlements')) {
      if (!this.entitlements.has(params[0])) this.entitlements.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_metrics') || sql.startsWith('INSERT INTO user_metrics')) {
      if (sql.includes('ON CONFLICT')) {
        const existing = JSON.parse(this.metrics.get(params[0]) || '{}');
        this.metrics.set(params[0], JSON.stringify({ ...JSON.parse(params[1]), ...existing }));
      } else if (!this.metrics.has(params[0])) this.metrics.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT INTO cloud_cycles') || sql.startsWith('INSERT OR IGNORE INTO cloud_cycles')) {
      const [id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at] = params;
      const key = `${user_id}:${id}`;
      const exists = this.cloudCycles.has(key);
      const limit = sql.includes('SELECT ?') ? params.at(-1) : Number.MAX_SAFE_INTEGER;
      const count = [...this.cloudCycles.values()].filter((row) => row.user_id === user_id).length;
      if (sql.includes('SELECT ?') && !exists && count >= limit) return { meta: { changes: 0 } };
      if (!sql.startsWith('INSERT OR IGNORE') || !exists) {
        const previous = this.cloudCycles.get(key);
        const incomingMetadata = JSON.parse(metadata_json || '{}');
        const previousMetadata = previous ? JSON.parse(previous.metadata_json || '{}') : {};
        if (previous && sql.includes('ON CONFLICT')) incomingMetadata.createdAt = previousMetadata.createdAt;
        this.cloudCycles.set(key, { id, user_id, label, cycle_date, metadata_json: JSON.stringify(incomingMetadata), payload_json, payload_bytes,
          created_at: previous?.created_at || created_at, updated_at });
      }
    } else if (sql.startsWith('UPDATE cloud_cycles SET label')) {
      const [label, updated_at, , , id, user_id] = params;
      const row = this.cloudCycles.get(`${user_id}:${id}`);
      if (row) {
        const metadata = JSON.parse(row.metadata_json || '{}');
        Object.assign(row, { label, updated_at, metadata_json: JSON.stringify({ ...metadata, label, updatedAt: updated_at }) });
      } else changes = 0;
    } else if (sql.startsWith('DELETE FROM cloud_cycles')) {
      const before = this.cloudCycles.size;
      if (params.length === 1) {
        for (const [key, row] of this.cloudCycles) if (row.user_id === params[0]) this.cloudCycles.delete(key);
      } else this.cloudCycles.delete(`${params[1]}:${params[0]}`);
      changes = before - this.cloudCycles.size;
    } else if (sql.startsWith('INSERT OR IGNORE INTO stripe_events')) {
      const [eventId, processedAt] = params;
      if (this.stripeEvents.has(eventId)) return { meta: { changes: 0 } };
      this.stripeEvents.add(eventId);
      return { meta: { changes: 1 }, processed_at: processedAt };
    } else if (sql.startsWith('DELETE FROM stripe_events')) {
      this.stripeEvents.delete(params[0]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO product_metric_events') || sql.startsWith('INSERT INTO product_metric_events')) {
      const [eventId, date, installation, type, userId] = params;
      this.metricEvents.add(`${eventId}:${date}:${installation}:${type}:${userId}`);
    } else if (sql.startsWith('INSERT OR IGNORE INTO billing_cleanup_queue')) {
      this.billingCleanupQueue.set(params[0], { customer_id: params[0], created_at: params[1], attempts: 0 });
    } else if (sql.startsWith('UPDATE billing_cleanup_queue')) {
      const [last_error, next_attempt_at, customer_id] = params;
      const row = this.billingCleanupQueue.get(customer_id);
      if (row) Object.assign(row, { attempts: row.attempts + 1, last_error, next_attempt_at });
    } else if (sql.startsWith('DELETE FROM billing_cleanup_queue')) {
      this.billingCleanupQueue.delete(params[0]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO workflow_awareness') || sql.startsWith('INSERT INTO workflow_awareness')) {
      const [user_id, cycle_id, data_json] = params;
      this.workflowAwareness.set(`${user_id}:${cycle_id}`, { user_id, cycle_id, data_json });
    } else if (sql.startsWith('WITH slots(slot_id) AS (VALUES')) {
      const [user_id, product_id, data_json] = params;
      if ([...this.customProducts.values()].some((row) => row.user_id === user_id && row.product_id === product_id)) {
        throw new Error('UNIQUE constraint failed: custom_products.user_id, custom_products.product_id');
      }
      const slotId = Array.from({ length: 16 }, (_, index) => `product-${String(index + 1).padStart(2, '0')}`)
        .find((candidate) => !this.customProducts.has(`${user_id}:${candidate}`));
      if (!slotId) return { meta: { changes: 0 } };
      this.customProducts.set(`${user_id}:${slotId}`, { user_id, slot_id: slotId, product_id, data_json });
    } else if (sql.startsWith('INSERT OR IGNORE INTO custom_products')) {
      const [user_id, slot_id, product_id, data_json] = params;
      this.customProducts.set(`${user_id}:${slot_id}`, { user_id, slot_id, product_id, data_json });
    } else if (sql.startsWith('UPDATE custom_products SET data_json')) {
      const [data_json, user_id, slot_id, product_id, expectedVersion] = params;
      const row = this.customProducts.get(`${user_id}:${slot_id}`);
      if (row && row.product_id === product_id && JSON.parse(row.data_json).version === expectedVersion) row.data_json = data_json;
      else changes = 0;
    } else if (sql.startsWith('DELETE FROM custom_products WHERE user_id = ? AND slot_id = ?')) {
      const [, user_id, slot_id, product_id] = [null, ...params];
      const key = `${user_id}:${slot_id}`;
      const row = this.customProducts.get(key);
      if (row && row.product_id === product_id) this.customProducts.delete(key);
      else changes = 0;
    } else if (sql.startsWith('INSERT INTO user_records')) {
      const [user_id, record_type, record_id, data_json, created_at, updated_at] = params;
      this.records.set(`${user_id}:${record_type}:${record_id}`, { user_id, record_type, record_id, data_json, created_at, updated_at });
    } else if (sql.startsWith('DELETE FROM user_records')) {
      const before = this.records.size;
      const [user_id, record_type, record_id] = params;
      if (record_type === undefined) {
        for (const [key, record] of this.records) if (record.user_id === user_id) this.records.delete(key);
      } else this.records.delete(`${user_id}:${record_type}:${record_id}`);
      changes = before - this.records.size;
    } else if (sql.startsWith('DELETE FROM user_settings')) {
      changes = Number(this.settings.has(params[0]));
      this.settings.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM user_entitlements')) {
      changes = Number(this.entitlements.has(params[0]));
      this.entitlements.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM user_metrics')) {
      changes = Number(this.metrics.has(params[0]));
      this.metrics.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM workflow_awareness')) {
      for (const [key, row] of this.workflowAwareness) if (row.user_id === params[0]) this.workflowAwareness.delete(key);
    } else if (sql.startsWith('DELETE FROM custom_products')) {
      for (const [key, row] of this.customProducts) if (row.user_id === params[0]) this.customProducts.delete(key);
    } else if (sql.startsWith('DELETE FROM product_metric_events')) {
      for (const key of this.metricEvents) if (key.endsWith(`:${params[0]}`)) this.metricEvents.delete(key);
    } else if (sql.startsWith('DELETE FROM users')) {
      changes = Number(this.users.has(params[0]));
      this.users.delete(params[0]);
    }
    return { meta: { changes } };
  }
}

const withClerkFetch = async (action) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('https://api.clerk.com/v1/users/')) {
      return Response.json({
        id: 'user_beta_test',
        first_name: 'Beta',
        last_name: 'Tester',
        primary_email_address_id: 'email_test',
        email_addresses: [{ id: 'email_test', email_address: 'Test@Example.com', verification: { status: 'verified' } }],
      });
    }
    return originalFetch(input, init);
  };
  try { return await action(); } finally { globalThis.fetch = originalFetch; }
};

const createEnv = (db = new D1Mock(), snapshot = null) => ({
  DB: db,
  PUBLIC_ORIGIN: 'https://beta.gfcweather.com',
  CLERK_AUTHORIZED_PARTIES: 'https://beta.gfcweather.com',
  CLERK_JWT_KEY: jwtKey,
  CLERK_SECRET_KEY: 'sk_test_worker',
  BETA_AUTH_BACKEND: 'clerk-d1',
  ASSETS: { fetch: async () => new Response('assets') },
  ...(snapshot ? { FIRESTORE_SNAPSHOT: { get: async () => ({ json: async () => snapshot }) } } : {}),
});

const call = (path, env, { method = 'GET', body } = {}) => worker.fetch(new Request(`https://beta.gfcweather.com${path}`, {
  method,
  headers: { Authorization: `Bearer ${createToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}), env);

test('the Worker serves health and public billing configuration without a user session', async () => {
  const verified = await verifyToken(createToken(), { jwtKey, authorizedParties: ['https://beta.gfcweather.com'] });
  assert.deepEqual(verified.errors, undefined);
  assert.equal((verified.data || verified).sub, 'user_beta_test');
  const health = await worker.fetch(new Request('https://beta.gfcweather.com/api/health'), createEnv());
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'gfc-beta-worker');
  const config = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/config'), createEnv());
  assert.equal(config.status, 200);
  assert.equal((await config.json()).checkoutEnabled, false);
});

test('authentication rejects signed sessions when no authorized party is configured', async () => {
  const env = createEnv();
  env.CLERK_AUTHORIZED_PARTIES = '';
  delete env.PUBLIC_ORIGIN;
  const identity = await __test.authenticate(new Request('https://attacker.example/api/me/bootstrap', {
    headers: { Authorization: `Bearer ${createToken()}` },
  }), env);
  assert.equal(identity, null);
});

test('beta invite claim updates the authenticated user with the D1 bind order', async () => {
  const db = new D1Mock();
  const env = createEnv(db);
  env.BETA_INVITE_TOKEN = 'invite-token';
  env.BETA_INVITE_PATH = 'private-beta';
  await withClerkFetch(async () => {
    const response = await call('/api/beta/claim', env, {
      method: 'POST', body: { token: 'invite-token', invitePath: 'private-beta' },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).betaAccess, true);
    assert.equal(db.users.get('user_beta_test')?.beta_access, 1);
  });
});

test('Firebase beta mode proxies API requests to the configured VPS origin', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded = '';
  globalThis.fetch = async (input) => {
    forwarded = input instanceof Request ? input.url : String(input);
    return Response.json({ from: 'vps' });
  };
  try {
    const env = { BETA_AUTH_BACKEND: 'firebase', BETA_API_ORIGIN: 'https://beta-gfc.weatherboysuper.com', ASSETS: { fetch: async () => new Response('assets') } };
    const response = await worker.fetch(new Request('https://beta.gfcweather.com/api/user/settings?scope=beta'), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { from: 'vps' });
    assert.equal(forwarded, 'https://beta-gfc.weatherboysuper.com/api/user/settings?scope=beta');
  } finally { globalThis.fetch = originalFetch; }
});

test('first verified Clerk request migrates matching snapshot settings and ownership into D1', async () => {
  const db = new D1Mock();
  const env = createEnv(db, {
    uid: 'firebase_old_uid',
    userProfile: { email: 'test@example.com', betaAccess: true },
    userSettings: { darkMode: true, cloudCycles: { old: 'legacy' } },
    userEntitlement: { premiumActive: true, uid: 'firebase_old_uid' },
    userMetrics: { uid: 'firebase_old_uid', cyclesCreated: 4 },
    cloudCycles: [], workflowAwareness: [], customProducts: [],
  });
  await withClerkFetch(async () => {
    const identity = await __test.authenticate(new Request('https://beta.gfcweather.com/api/me/bootstrap', { headers: { Authorization: `Bearer ${createToken()}` } }), env);
    assert.equal(identity?.email, 'test@example.com');
    const response = await call('/api/me/bootstrap', env);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.user.id, 'user_beta_test');
    assert.equal(body.user.betaAccess, true);
    assert.equal(body.user.migrationStatus, 'complete');
    assert.equal(body.settings.darkMode, true);
    assert.equal(body.entitlement.uid, 'user_beta_test');
    assert.equal(body.metrics.uid, 'user_beta_test');
    assert.equal(db.users.get('user_beta_test').legacy_uid, 'firebase_old_uid');
  });
});

test('email ownership conflicts return 409 without changing the existing account row', async () => {
  const db = new D1Mock();
  db.users.set('other_clerk_user', { clerk_id: 'other_clerk_user', email: 'test@example.com', legacy_uid: 'legacy_owner' });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', createEnv(db));
    assert.equal(response.status, 409);
    assert.deepEqual(db.users.get('other_clerk_user'), { clerk_id: 'other_clerk_user', email: 'test@example.com', legacy_uid: 'legacy_owner' });
    assert.equal(db.users.has('user_beta_test'), false);
  });
});

test('a user with no initial snapshot match can migrate when the retained snapshot is uploaded later', async () => {
  const db = new D1Mock();
  await withClerkFetch(async () => {
    const initial = await call('/api/me/bootstrap', createEnv(db));
    assert.equal((await initial.json()).user.migrationStatus, 'no_match');
    const localSettings = await call('/api/user/settings', createEnv(db), {
      method: 'PUT', body: { settings: { darkMode: true, localOnly: 'keep this' } },
    });
    assert.equal(localSettings.status, 200);
    const afterUpload = await call('/api/me/bootstrap', createEnv(db, {
      uid: 'firebase_late_uid', userProfile: { email: 'test@example.com', betaAccess: true },
      userSettings: { darkMode: false, migratedField: 'from snapshot' }, cloudCycles: [], workflowAwareness: [], customProducts: [],
    }));
    const migrated = await afterUpload.json();
    assert.equal(migrated.user.migrationStatus, 'complete');
    assert.equal(migrated.user.betaAccess, true);
    assert.deepEqual(migrated.settings, { darkMode: true, localOnly: 'keep this', migratedField: 'from snapshot' });
  });
});

test('snapshot migration respects D1 cycle and custom-product limits', async () => {
  const db = new D1Mock();
  const env = createEnv(db, {
    cloudCycles: Array.from({ length: 105 }, (_, index) => ({ id: `cycle-${index}`, payloadJson: '{}', metadata: {} })),
    customProducts: Array.from({ length: 20 }, (_, index) => ({ id: `legacy-${index}`, data: { id: `product-${index}`, version: 1 } })),
  });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', env);
    assert.equal(response.status, 200);
    assert.equal(db.cloudCycles.size, 100);
    assert.equal(db.customProducts.size, 16);
    assert.equal(db.customProducts.has('user_beta_test:product-01'), true);
    assert.equal(db.customProducts.has('user_beta_test:product-16'), true);
    assert.equal(db.customProducts.has('user_beta_test:legacy-0'), false);
  });
});

test('cloud cycle writes reject malformed payloads and preserve ownership and timestamps', async () => {
  const db = new D1Mock();
  db.entitlements.set('user_beta_test', JSON.stringify({ premiumActive: true }));
  const env = createEnv(db);
  const cycle = { id: 'cycle-1', label: 'Morning', cycleDate: '2026-10-15', metadata: { createdAt: '2026-10-01T00:00:00.000Z', userId: 'spoofed-user' }, payloadJson: '{}' };
  await withClerkFetch(async () => {
    const malformed = await call('/api/cloud-cycles', env, { method: 'POST', body: { ...cycle, payloadJson: '{' } });
    assert.equal(malformed.status, 400);
    const slashId = await call('/api/cloud-cycles', env, { method: 'POST', body: { ...cycle, id: 'bad/id' } });
    assert.equal(slashId.status, 400);
    const create = await call('/api/cloud-cycles', env, { method: 'POST', body: cycle });
    assert.equal(create.status, 200, await create.clone().text());
    assert.equal(JSON.parse(db.cloudCycles.get('user_beta_test:cycle-1').metadata_json).userId, 'user_beta_test');
    const originalCreatedAt = db.cloudCycles.get('user_beta_test:cycle-1').created_at;
    const update = await call('/api/cloud-cycles', env, { method: 'POST', body: { ...cycle, label: 'Afternoon' } });
    assert.equal(update.status, 200);
    const listed = await call('/api/cloud-cycles', env);
    const [saved] = (await listed.json()).cycles;
    assert.equal(saved.label, 'Afternoon');
    assert.equal(saved.createdAt, originalCreatedAt);
    const remove = await call('/api/cloud-cycles/cycle-1', env, { method: 'DELETE' });
    assert.equal(remove.status, 200);
    const missing = await call('/api/cloud-cycles/cycle-1', env, { method: 'DELETE' });
    assert.equal(missing.status, 404);
  });
});

test('cloud cycle quota check rejects writes at the limit', async () => {
  const db = new D1Mock();
  db.entitlements.set('user_beta_test', JSON.stringify({ premiumActive: true }));
  for (let index = 0; index < 100; index += 1) {
    const id = `existing-${index}`;
    db.cloudCycles.set(`user_beta_test:${id}`, {
      id, user_id: 'user_beta_test', label: id, cycle_date: '2026-10-15', metadata_json: '{}',
      payload_json: '{}', payload_bytes: 2, created_at: '', updated_at: '',
    });
  }
  await withClerkFetch(async () => {
    const response = await call('/api/cloud-cycles', createEnv(db), { method: 'POST', body: {
      id: 'new-cycle', label: 'New', cycleDate: '2026-10-15', metadata: {}, payloadJson: '{}',
    } });
    assert.equal(response.status, 409);
  });
});

test('the D1 schema and capacity/merge SQL execute against SQLite', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(await readFile(new URL('./migrations/0001_beta_auth_data.sql', import.meta.url), 'utf8'));
    sqlite.prepare('INSERT INTO users (clerk_id, email, email_verified, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
      .run('user_sqlite', 'sqlite@example.com', '2026-10-15', '2026-10-15');

    sqlite.prepare(`INSERT INTO user_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_settings.data_json), updated_at = excluded.updated_at`)
      .run('user_sqlite', JSON.stringify({ theme: 'local' }), '2026-10-15');
    sqlite.prepare(`INSERT INTO user_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_settings.data_json), updated_at = excluded.updated_at`)
      .run('user_sqlite', JSON.stringify({ legacy: true, theme: 'legacy' }), '2026-10-15');
    assert.deepEqual(JSON.parse(sqlite.prepare('SELECT data_json FROM user_settings WHERE user_id = ?').get('user_sqlite').data_json), { legacy: true, theme: 'local' });

    const cycleWrite = sqlite.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM cloud_cycles WHERE user_id = ? AND id = ?)
        OR (SELECT COUNT(*) FROM cloud_cycles WHERE user_id = ?) < ?
      ON CONFLICT(user_id, id) DO UPDATE SET label = excluded.label, cycle_date = excluded.cycle_date,
        metadata_json = json_set(excluded.metadata_json, '$.createdAt', json_extract(cloud_cycles.metadata_json, '$.createdAt')),
        payload_json = excluded.payload_json, payload_bytes = excluded.payload_bytes, updated_at = excluded.updated_at`);
    const runCycleWrite = (id, limit) => cycleWrite.run(id, 'user_sqlite', id, '2026-10-15', '{}', '{}', 2, 'created', 'updated', 'user_sqlite', id, 'user_sqlite', limit);
    runCycleWrite('cycle-1', 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_cycles').get().count, 1);
    const noOpRetry = runCycleWrite('cycle-1', 1);
    assert.equal(noOpRetry.changes, 1);
    runCycleWrite('cycle-2', 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_cycles').get().count, 1);

    const slots = Array.from({ length: 2 }, (_, index) => `('product-${String(index + 1).padStart(2, '0')}')`).join(', ');
    const insertSlot = sqlite.prepare(`WITH slots(slot_id) AS (VALUES ${slots})
      INSERT INTO custom_products (user_id, slot_id, product_id, data_json)
      SELECT ?, slots.slot_id, ?, ? FROM slots
      WHERE NOT EXISTS (SELECT 1 FROM custom_products WHERE user_id = ? AND slot_id = slots.slot_id)
      ORDER BY slots.slot_id LIMIT 1`);
    insertSlot.run('user_sqlite', 'one', '{}', 'user_sqlite');
    insertSlot.run('user_sqlite', 'two', '{}', 'user_sqlite');
    assert.equal(insertSlot.run('user_sqlite', 'three', '{}', 'user_sqlite').changes, 0);

    const insertMetric = sqlite.prepare('INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id) VALUES (?, ?, ?, ?, ?)');
    insertMetric.run('evt-1', '2026-10-15', 'install-1', 'cloud_cycle_saved', 'user_sqlite');
    insertMetric.run('evt-2', '2026-10-15', 'install-1', 'cloud_cycle_saved', 'user_sqlite');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM product_metric_events').get().count, 2);
  } finally {
    sqlite.close();
  }
});

test('workflow awareness rejects empty cycle IDs and returns persisted envelopes', async () => {
  const db = new D1Mock();
  await withClerkFetch(async () => {
    const invalid = await call('/api/workflow-awareness', createEnv(db), {
      method: 'PUT', body: { record: { metadata: { cycleId: '' } } },
    });
    assert.equal(invalid.status, 400);
    const record = { consentVersion: 1, schemaVersion: 1, metadata: { cycleId: 'cycle-1' } };
    const saved = await call('/api/workflow-awareness', createEnv(db), { method: 'PUT', body: { record } });
    assert.equal(saved.status, 200);
    const list = await call('/api/workflow-awareness', createEnv(db));
    assert.deepEqual((await list.json()).records, [record]);
  });
});

test('custom products validate IDs and support account-scoped CRUD with version checks', async () => {
  const db = new D1Mock();
  const env = createEnv(db);
  await withClerkFetch(async () => {
    const invalid = await call('/api/custom-products', env, { method: 'POST', body: {
      product: { id: '  ', userId: 'user_beta_test', version: 1 },
    } });
    assert.equal(invalid.status, 400);
    const create = await call('/api/custom-products', env, { method: 'POST', body: {
      product: { id: ' product-1 ', userId: 'user_beta_test', version: 1, label: 'Test' },
    } });
    assert.equal(create.status, 200, await create.clone().text());
    assert.equal((await create.json()).product.id, 'product-1');
    const update = await call('/api/custom-products/product-1', env, { method: 'PATCH', body: {
      expectedVersion: 1, product: { id: 'product-1', userId: 'user_beta_test', version: 2, label: 'Updated' },
    } });
    assert.equal(update.status, 200);
    const stale = await call('/api/custom-products/product-1', env, { method: 'PATCH', body: {
      expectedVersion: 1, product: { id: 'product-1', userId: 'user_beta_test', version: 2 },
    } });
    assert.equal(stale.status, 409);
    const remove = await call('/api/custom-products/product-1', env, { method: 'DELETE', body: { expectedVersion: 2 } });
    assert.equal(remove.status, 200);
    assert.equal(db.customProducts.size, 0);
  });
});

test('billing checkout requires a configured public origin and builds a trusted return URL', async () => {
  const env = { ...createEnv(), STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_MONTHLY: 'price_monthly' };
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (input) => {
    if (String(input).startsWith('https://api.clerk.com/v1/users/')) {
      return Response.json({ id: 'user_beta_test', first_name: 'Beta', primary_email_address_id: 'email_test', email_addresses: [{ id: 'email_test', email_address: 'test@example.com', verification: { status: 'verified' } }] });
    }
    urls.push(String(input));
    return Response.json({ url: 'https://checkout.stripe.test/session' });
  };
  try {
    const response = await call('/api/billing/checkout', env, { method: 'POST', body: { plan: 'monthly' } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: 'https://checkout.stripe.test/session' });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions$/);
    delete env.PUBLIC_ORIGIN;
    const unconfigured = await call('/api/billing/checkout', env, { method: 'POST', body: { plan: 'monthly' } });
    assert.equal(unconfigured.status, 503);
    assert.equal(urls.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('admin metrics validates the allowlist window and aggregates the requested window', async () => {
  const env = { ...createEnv(), ADMIN_CLERK_ID_ALLOWLIST: 'user_beta_test' };
  await withClerkFetch(async () => {
    const invalid = await call('/api/admin/metrics?window=2', env);
    assert.equal(invalid.status, 400);
    const valid = await call('/api/admin/metrics?window=7', env);
    assert.equal(valid.status, 200);
    const data = await valid.json();
    assert.equal(data.window, 7);
    assert.equal(data.metricsEnabled, true);
  });
});

test('forecast, discussion, verification and settings endpoints enforce account-scoped CRUD', async () => {
  const env = createEnv();
  await withClerkFetch(async () => {
    for (const [route, id] of [['forecasts', 'forecast-1'], ['discussions', 'discussion-1'], ['verifications', 'verification-1']]) {
      const write = await call(`/api/${route}`, env, { method: 'PUT', body: { id, data: { value: route } } });
      assert.equal(write.status, 200);
      const list = await call(`/api/${route}`, env);
      assert.deepEqual((await list.json()).records.map((record) => record.id), [id]);
      const read = await call(`/api/${route}/${id}`, env);
      assert.equal((await read.json()).record.data.value, route);
      const remove = await call(`/api/${route}/${id}`, env, { method: 'DELETE' });
      assert.equal(remove.status, 200);
      assert.deepEqual((await (await call(`/api/${route}`, env)).json()).records, []);
    }
    const settingsWrite = await call('/api/user/settings', env, { method: 'PUT', body: { settings: { darkMode: true } } });
    assert.equal(settingsWrite.status, 200);
    const settingsRead = await call('/api/user/settings', env);
    assert.deepEqual((await settingsRead.json()).settings, { darkMode: true });
  });
});

test('authenticated JSON writes reject oversized request bodies before parsing', async () => {
  const env = createEnv();
  const response = await withClerkFetch(() => worker.fetch(new Request('https://beta.gfcweather.com/api/user/settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${createToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { value: 'x'.repeat(750_001) } }),
  }), env));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'Request body is too large.' });
});

test('Clerk deletion cleanup removes D1-owned user records idempotently', async () => {
  const db = new D1Mock();
  const env = createEnv(db);
  const user = { clerk_id: 'user_beta_test', email: 'test@example.com', legacy_uid: null, display_name: 'Beta Tester', beta_access: 1, migration_status: 'complete' };
  db.users.set(user.clerk_id, user);
  db.records.set(`${user.clerk_id}:forecast:forecast-1`, { user_id: user.clerk_id, record_type: 'forecast', record_id: 'forecast-1' });
  db.settings.set(user.clerk_id, '{}');
  db.entitlements.set(user.clerk_id, JSON.stringify({ stripeCustomerId: 'cus_beta_test' }));
  db.metricEvents.add(`2026-10-15:installation:account_signin:${user.clerk_id}`);
  await __test.deleteBetaUserData(user.clerk_id, env);
  await __test.deleteBetaUserData(user.clerk_id, env);
  assert.equal(db.users.has(user.clerk_id), false);
  assert.equal(db.settings.has(user.clerk_id), false);
  assert.equal(db.billingCleanupQueue.has('cus_beta_test'), true);
  assert.equal(db.metricEvents.size, 0);
  assert.equal(db.records.size, 0);
});

test('Stripe webhook verifies any valid v1 signature and ignores duplicate event IDs', async () => {
  const raw = JSON.stringify({ id: 'evt_beta_test', type: 'customer.updated', data: { object: {} } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', 'whsec_beta_test').update(`${timestamp}.${raw}`).digest('hex');
  const env = { ...createEnv(), STRIPE_WEBHOOK_SECRET: 'whsec_beta_test' };
  const send = () => worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${timestamp}, v1=${'0'.repeat(64)}, v1=${signature}` },
    body: raw,
  }), env);

  const first = await send();
  assert.equal(first.status, 200, await first.clone().text());
  assert.deepEqual(await first.json(), { received: true });
  const duplicate = await send();
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { received: true, duplicate: true });
});

test('Stripe webhook rejects malformed JSON even when its signature is valid', async () => {
  const raw = '{';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', 'whsec_beta_test').update(`${timestamp}.${raw}`).digest('hex');
  const response = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
    method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
  }), { ...createEnv(), STRIPE_WEBHOOK_SECRET: 'whsec_beta_test' });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid webhook payload.' });
});

test('the Sentry tunnel only forwards envelopes for the configured project', async () => {
  const env = { ...createEnv(), SENTRY_BROWSER_DSN: 'https://public-key@o123.ingest.sentry.io/456' };
  const originalFetch = globalThis.fetch;
  let forwardedUrl = '';
  globalThis.fetch = async (input) => {
    forwardedUrl = String(input);
    return new Response(null, { status: 200 });
  };
  try {
    const envelope = '{"dsn":"https://public-key@o123.ingest.sentry.io/456","event_id":"event"}\n{"type":"event"}\n{}';
    const valid = await worker.fetch(new Request('https://beta.gfcweather.com/api/sentry-tunnel', { method: 'POST', body: envelope }), env);
    assert.equal(valid.status, 200);
    assert.equal(forwardedUrl, 'https://o123.ingest.sentry.io/api/456/envelope/');
    const invalid = await worker.fetch(new Request('https://beta.gfcweather.com/api/sentry-tunnel', {
      method: 'POST', body: '{"dsn":"https://public-key@evil.example/999"}\n{}',
    }), env);
    assert.equal(invalid.status, 400);
    const oversized = await worker.fetch(new Request('https://beta.gfcweather.com/api/sentry-tunnel', {
      method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(100 * 1024 + 1)); controller.close(); } }),
      duplex: 'half',
    }), env);
    assert.equal(oversized.status, 413);
  } finally { globalThis.fetch = originalFetch; }
});
