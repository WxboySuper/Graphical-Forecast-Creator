import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
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
  }
  prepare(sql) { return new D1Statement(this, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  async first(sql, params) {
    if (sql.startsWith('SELECT * FROM users WHERE clerk_id')) return this.users.get(params[0]) || null;
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
    return null;
  }
  async all(sql, params) {
    if (sql.startsWith('SELECT record_id, data_json, created_at, updated_at FROM user_records')) {
      const [, userId, type] = [null, params[0], params[1]];
      return { results: [...this.records.values()].filter((record) => record.user_id === userId && record.record_type === type) };
    }
    return { results: [] };
  }
  async run(sql, params) {
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
      if (user) Object.assign(user, { migration_status, updated_at, ...(params.length === 4 && params[1] === 1 ? { beta_access: 1 } : {}) });
    } else if (sql.startsWith('UPDATE users SET email')) {
      const [email, updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { email, updated_at, email_verified: 1 });
    } else if (sql.startsWith('UPDATE users SET beta_access')) {
      const [beta_access, updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { beta_access, updated_at });
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_settings') || sql.startsWith('INSERT INTO user_settings')) {
      if (!this.settings.has(params[0])) this.settings.set(params[0], params[1]);
      else this.settings.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_entitlements') || sql.startsWith('INSERT INTO user_entitlements')) {
      if (!this.entitlements.has(params[0])) this.entitlements.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_metrics') || sql.startsWith('INSERT INTO user_metrics')) {
      if (!this.metrics.has(params[0])) this.metrics.set(params[0], params[1]);
      else this.metrics.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT INTO user_records')) {
      const [user_id, record_type, record_id, data_json, created_at, updated_at] = params;
      this.records.set(`${user_id}:${record_type}:${record_id}`, { user_id, record_type, record_id, data_json, created_at, updated_at });
    } else if (sql.startsWith('DELETE FROM user_records')) {
      const [user_id, record_type, record_id] = params;
      if (record_type === undefined) {
        for (const [key, record] of this.records) if (record.user_id === user_id) this.records.delete(key);
      } else this.records.delete(`${user_id}:${record_type}:${record_id}`);
    } else if (sql.startsWith('DELETE FROM user_settings')) {
      this.settings.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM user_entitlements')) {
      this.entitlements.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM user_metrics')) {
      this.metrics.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM users')) {
      this.users.delete(params[0]);
    }
    return { meta: { changes: 1 } };
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

test('a user with no initial snapshot match can migrate when the retained snapshot is uploaded later', async () => {
  const db = new D1Mock();
  await withClerkFetch(async () => {
    const initial = await call('/api/me/bootstrap', createEnv(db));
    assert.equal((await initial.json()).user.migrationStatus, 'no_match');
    const afterUpload = await call('/api/me/bootstrap', createEnv(db, {
      uid: 'firebase_late_uid', userProfile: { email: 'test@example.com', betaAccess: true },
      userSettings: { darkMode: false }, cloudCycles: [], workflowAwareness: [], customProducts: [],
    }));
    const migrated = await afterUpload.json();
    assert.equal(migrated.user.migrationStatus, 'complete');
    assert.equal(migrated.user.betaAccess, true);
    assert.equal(migrated.settings.darkMode, false);
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

test('Clerk deletion cleanup removes D1-owned user records idempotently', async () => {
  const db = new D1Mock();
  const env = createEnv(db);
  const user = { clerk_id: 'user_beta_test', email: 'test@example.com', legacy_uid: null, display_name: 'Beta Tester', beta_access: 1, migration_status: 'complete' };
  db.users.set(user.clerk_id, user);
  db.records.set(`${user.clerk_id}:forecast:forecast-1`, { user_id: user.clerk_id, record_type: 'forecast', record_id: 'forecast-1' });
  db.settings.set(user.clerk_id, '{}');
  await __test.deleteBetaUserData(user.clerk_id, env);
  await __test.deleteBetaUserData(user.clerk_id, env);
  assert.equal(db.users.has(user.clerk_id), false);
  assert.equal(db.settings.has(user.clerk_id), false);
  assert.equal(db.records.size, 0);
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
  } finally { globalThis.fetch = originalFetch; }
});
