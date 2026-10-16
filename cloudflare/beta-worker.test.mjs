import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker, { __test, MAX_PRODUCT_METRIC_DAILY_EVENTS } from './beta-worker.mjs';
import { D1Mock } from './beta-worker-test-mock.mjs';
import { verifyToken } from '@clerk/backend';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
beforeEach(() => __test.clearAuthCache());

const createToken = (sessionId = 'sess_beta_test') => {
  const now = Math.floor(Date.now() / 1000);
  const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
    iss: 'https://test.clerk.accounts.dev', sub: 'user_beta_test', sid: sessionId,
    iat: now, nbf: now - 1, exp: now + 300, azp: 'https://beta.gfcweather.com',
  })}`;
  return `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
};

const createEnv = (db = new D1Mock(), snapshot = null) => ({
  DB: db,
  PUBLIC_ORIGIN: 'https://beta.gfcweather.com',
  CLERK_AUTHORIZED_PARTIES: 'https://beta.gfcweather.com',
  CLERK_JWT_KEY: jwtKey,
  CLERK_SECRET_KEY: 'sk_test_worker',
  BETA_AUTH_BACKEND: 'clerk-d1',
  ASSETS: { fetch: async () => new Response('assets') },
  FIRESTORE_SNAPSHOT: { get: async () => snapshot ? ({ json: async () => snapshot }) : null },
});

const call = (path, env, { method = 'GET', body } = {}) => worker.fetch(new Request(`https://beta.gfcweather.com${path}`, {
  method,
  headers: { Authorization: `Bearer ${createToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}), env);

const withClerkFetch = async (action, stripeFetch = null) => {
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
    if (String(input).startsWith('https://api.stripe.com/v1/') && stripeFetch) return stripeFetch(input, init);
    return originalFetch(input, init);
  };
  try { return await action(); } finally { globalThis.fetch = originalFetch; }
};

test('the Worker serves health and public billing configuration without a user session', async () => {
  const verified = await verifyToken(createToken(), { jwtKey, authorizedParties: ['https://beta.gfcweather.com'] });
  assert.deepStrictEqual(verified.errors, undefined);
  assert.equal((verified.data || verified).sub, 'user_beta_test');
  const health = await worker.fetch(new Request('https://beta.gfcweather.com/api/health'), createEnv());
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'gfc-beta-worker');
  const config = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/config'), createEnv());
  assert.equal(config.status, 200);
  assert.equal((await config.json()).checkoutEnabled, false);
  const unavailable = createEnv({ prepare: () => ({ first: async () => { throw new Error('no migrated schema'); } }) });
  const unhealthy = await worker.fetch(new Request('https://beta.gfcweather.com/api/health'), unavailable);
  assert.equal(unhealthy.status, 503);
  assert.deepStrictEqual(await unhealthy.json(), { status: 'error', service: 'gfc-beta-worker', database: false });
  const missingDatabase = await worker.fetch(new Request('https://beta.gfcweather.com/api/health'), { ...createEnv(), DB: undefined });
  assert.equal(missingDatabase.status, 503);
  assert.equal((await missingDatabase.json()).status, 'error');
});

test('authentication rejects signed sessions when no authorized party is configured', async () => {
  const env = createEnv();
  env.CLERK_AUTHORIZED_PARTIES = '';
  delete env.PUBLIC_ORIGIN;
  const request = new Request('https://attacker.example/api/me/bootstrap', {
    headers: { Authorization: `Bearer ${createToken()}` },
  });
  await assert.rejects(__test.authenticate(request, env), { code: 'CLERK_CONFIG_MISSING' });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 503);
  env.CLERK_AUTHORIZED_PARTIES = 'https://beta.gfcweather.com';
  delete env.CLERK_SECRET_KEY;
  await assert.rejects(__test.authenticate(request, env), { code: 'CLERK_CONFIG_MISSING' });
  const missingKeyResponse = await worker.fetch(request, env);
  assert.equal(missingKeyResponse.status, 503);
});

test('Clerk profile cache does not reuse identity across different session tokens', async () => {
  const originalFetch = globalThis.fetch;
  let verification = 'verified';
  let profileFetches = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('https://api.clerk.com/v1/users/')) {
      profileFetches += 1;
      return Response.json({
        id: 'user_beta_test', first_name: 'Beta', last_name: 'Tester', primary_email_address_id: 'email_test',
        email_addresses: [{ id: 'email_test', email_address: 'test@example.com', verification: { status: verification } }],
      });
    }
    return originalFetch(input, init);
  };
  try {
    const env = createEnv();
    const first = await __test.authenticate(new Request('https://beta.gfcweather.com/api/me/bootstrap', {
      headers: { Authorization: `Bearer ${createToken('session-one')}` },
    }), env);
    verification = 'unverified';
    const second = await __test.authenticate(new Request('https://beta.gfcweather.com/api/me/bootstrap', {
      headers: { Authorization: `Bearer ${createToken('session-two')}` },
    }), env);
    assert.equal(first.email, 'test@example.com');
    assert.equal(second, null);
    assert.equal(profileFetches, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    assert.deepStrictEqual(await response.json(), { from: 'vps' });
    assert.equal(forwarded, 'https://beta-gfc.weatherboysuper.com/api/user/settings?scope=beta');
  } finally { globalThis.fetch = originalFetch; }
});

test('first verified Clerk request migrates matching snapshot data and verifies Stripe entitlement', async () => {
  const db = new D1Mock();
  const env = createEnv(db, {
    uid: 'firebase_old_uid',
    userProfile: { email: 'test@example.com', betaAccess: true },
    userSettings: { darkMode: true, cloudCycles: { old: 'legacy' } },
    userEntitlement: { premiumActive: true, uid: 'firebase_old_uid', billingStatus: 'active', stripeCustomerId: 'cus_beta', stripeSubscriptionId: 'sub_beta' },
    userMetrics: { uid: 'firebase_old_uid', cyclesCreated: 4 },
    cloudCycles: [], workflowAwareness: [], customProducts: [],
  });
  env.STRIPE_SECRET_KEY = 'sk_test_beta';
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
    assert.equal(body.entitlement.premiumActive, true);
    assert.equal(body.entitlement.billingStatus, 'active');
    assert.equal(body.entitlement.pendingStripeSync, false);
    assert.equal(body.metrics.uid, 'user_beta_test');
    assert.equal(db.users.get('user_beta_test').legacy_uid, 'firebase_old_uid');
  }, async (input) => {
    assert.match(String(input), /subscriptions\/sub_beta$/);
    return Response.json({ id: 'sub_beta', customer: 'cus_beta', status: 'active', current_period_end: 1_800_000_000,
      items: { data: [{ price: { recurring: { interval: 'month' } } }] } });
  });
});

test('email ownership conflicts return 409 without changing the existing account row', async () => {
  const db = new D1Mock();
  db.users.set('other_clerk_user', { clerk_id: 'other_clerk_user', email: 'test@example.com', legacy_uid: 'legacy_owner' });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', createEnv(db));
    assert.equal(response.status, 409);
    assert.deepStrictEqual(db.users.get('other_clerk_user'), { clerk_id: 'other_clerk_user', email: 'test@example.com', legacy_uid: 'legacy_owner' });
    assert.equal(db.users.has('user_beta_test'), false);
  });
});

test('existing Clerk accounts refresh their email and display name safely', async () => {
  const db = new D1Mock();
  db.users.set('user_beta_test', {
    clerk_id: 'user_beta_test', email: 'test@example.com', display_name: 'Old Name', migration_status: 'complete',
    beta_access: 1, email_verified: 1,
  });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', createEnv(db));
    assert.equal(response.status, 200);
    assert.deepStrictEqual((await response.json()).user, {
      id: 'user_beta_test', email: 'test@example.com', displayName: 'Beta Tester', betaAccess: true, migrationStatus: 'complete',
    });
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
    assert.deepStrictEqual(migrated.settings, { darkMode: true, localOnly: 'keep this', migratedField: 'from snapshot' });
  });
});

test('snapshot migration preserves cycles and products beyond new-account quotas in bounded batches', async () => {
  const db = new D1Mock();
  const env = createEnv(db, {
    cloudCycles: Array.from({ length: 105 }, (_, index) => ({ id: `cycle-${index}`, label: `Cycle ${index}`, cycleDate: '2026-10-15', payloadJson: '{}', metadata: {} })),
    customProducts: Array.from({ length: 20 }, (_, index) => ({ id: `legacy-${index}`, data: { id: `product-${index}`, version: 1 } })),
  });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', env);
    assert.equal(response.status, 200);
    assert.equal(db.cloudCycles.size, 105);
    assert.equal(db.customProducts.size, 20);
    assert.ok(db.batchSizes.every((size) => size <= 50));
    assert.equal(db.customProducts.has('user_beta_test:product-01'), true);
    assert.equal(db.customProducts.has('user_beta_test:product-16'), true);
    assert.equal(db.customProducts.has('user_beta_test:legacy-17'), true);
    assert.equal(db.batchSizes.reduce((sum, size) => sum + size, 0), 126);
    const overQuota = await call('/api/custom-products', env, { method: 'POST', body: {
      product: { id: 'new-product', userId: 'user_beta_test', version: 1 },
    } });
    assert.equal(overQuota.status, 200);
    assert.equal(db.customProducts.size, 21);
  });
});

test('snapshot migration allocates products around products already created in D1', async () => {
  const db = new D1Mock();
  db.users.set('user_beta_test', {
    clerk_id: 'user_beta_test', email: 'test@example.com', legacy_uid: null, display_name: 'Beta Tester',
    beta_access: 1, migration_status: 'no_match', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  db.customProducts.set('user_beta_test:product-01', {
    user_id: 'user_beta_test', slot_id: 'product-01', product_id: 'created-before-migration',
    data_json: JSON.stringify({ id: 'created-before-migration', version: 1 }),
  });
  const env = createEnv(db, {
    uid: 'firebase_old_uid', userProfile: { email: 'test@example.com', betaAccess: true },
    userSettings: {}, cloudCycles: [], workflowAwareness: [],
    customProducts: [{ id: 'snapshot-product', data: { id: 'snapshot-product', version: 1 } }],
  });

  const response = await withClerkFetch(() => call('/api/me/bootstrap', env));
  assert.equal(response.status, 200);
  assert.equal(db.customProducts.has('user_beta_test:product-01'), true);
  assert.equal(db.customProducts.has('user_beta_test:product-02'), true);
  assert.equal([...db.customProducts.values()].find((row) => row.product_id === 'snapshot-product')?.slot_id, 'product-02');
});

test('snapshot migration rejects archives above automatic limits before writing child rows', async () => {
  const db = new D1Mock();
  const env = createEnv(db, {
    uid: 'firebase_large_uid', userProfile: { email: 'test@example.com' },
    cloudCycles: Array.from({ length: 301 }, (_, index) => ({ id: `cycle-${index}`, payloadJson: '{}', metadata: {} })),
  });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', env);
    assert.equal(response.status, 409);
    assert.equal(db.cloudCycles.size, 0);
    assert.equal(db.users.get('user_beta_test')?.migration_status, 'failed');
  });
});

test('snapshot migration rejects malformed account sub-documents as a permanent migration error', async () => {
  const db = new D1Mock();
  const env = createEnv(db, { uid: 'firebase_bad_uid', userProfile: { email: 'test@example.com' }, userSettings: 'malformed' });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', env);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /could not be migrated automatically/);
    assert.equal(db.settings.has('user_beta_test'), false);
  });
});

test('snapshot migration rejects cycle fields that fail the API schema', async () => {
  const env = createEnv(new D1Mock(), {
    userProfile: { email: 'test@example.com' }, userSettings: {},
    cloudCycles: [{ id: 'cycle-bad-label', label: { text: 'bad' }, cycleDate: '2026-10-15', payloadJson: '{}', metadata: {} }],
    workflowAwareness: [], customProducts: [],
  });
  await withClerkFetch(async () => {
    const response = await call('/api/me/bootstrap', env);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /could not be migrated automatically/);
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
    for (let index = 0; index < 11; index += 1) {
      const id = `cycle-${String(index + 2).padStart(2, '0')}`;
      db.cloudCycles.set(`user_beta_test:${id}`, { id, user_id: 'user_beta_test', label: id, cycle_date: '2026-10-15',
        metadata_json: JSON.stringify({}), payload_json: '{}', payload_bytes: 2, created_at: originalCreatedAt, updated_at: originalCreatedAt });
    }
    const listed = await call('/api/cloud-cycles?page=0', env);
    const firstPage = await listed.json();
    assert.equal(firstPage.cycles.length, 10);
    assert.equal(firstPage.nextPage, 1);
    const secondPage = await call('/api/cloud-cycles?page=1', env);
    const secondBody = await secondPage.json();
    assert.equal(secondBody.cycles.length, 2);
    assert.equal(secondBody.nextPage, null);
    const saved = [...firstPage.cycles, ...secondBody.cycles].find((item) => item.id === 'cycle-1');
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

async function createD1SQLite() {
  const sqlite = new DatabaseSync(':memory:');
  const [schema, workflowLimitMigration, cyclePayloadLimitMigration, workerSource] = await Promise.all([
    readFile(new URL('./migrations/0001_beta_auth_data.sql', import.meta.url), 'utf8'),
    readFile(new URL('./migrations/0002_workflow_payload_limit.sql', import.meta.url), 'utf8'),
    readFile(new URL('./migrations/0003_cloud_cycle_payload_bytes_limit.sql', import.meta.url), 'utf8'),
    readFile(new URL('./beta-worker.mjs', import.meta.url), 'utf8'),
  ]);
  sqlite.exec(schema);
  sqlite.exec(workflowLimitMigration);
  sqlite.exec(cyclePayloadLimitMigration);
  return { sqlite, schema, workerSource };
}

test('the D1 schema and Worker quota constants agree in SQLite', async () => {
  const { sqlite, schema, workerSource } = await createD1SQLite();
  try {
    assert.equal(MAX_PRODUCT_METRIC_DAILY_EVENTS, 500);
    for (const [constant, limit] of [['MAX_CLOUD_CYCLES', 100], ['MAX_CUSTOM_PRODUCTS', 16], ['MAX_USER_RECORDS', 200], ['MAX_WORKFLOW_RECORDS', 200], ['MAX_PRODUCT_METRIC_DAILY_EVENTS', MAX_PRODUCT_METRIC_DAILY_EVENTS]]) {
      assert.match(workerSource, new RegExp(`const ${constant} = ${limit};`));
      assert.ok(schema.includes(`>= ${limit}`), `${constant} SQL quota should remain ${limit}`);
    }
    assert.doesNotThrow(() => sqlite.prepare(`SELECT (SELECT 1 FROM users LIMIT 1) AS users,
      (SELECT 1 FROM user_settings LIMIT 1) AS settings, (SELECT 1 FROM user_entitlements LIMIT 1) AS entitlements,
      (SELECT 1 FROM user_metrics LIMIT 1) AS metrics, (SELECT 1 FROM cloud_cycles LIMIT 1) AS cloud_cycles,
      (SELECT 1 FROM workflow_awareness LIMIT 1) AS awareness, (SELECT 1 FROM custom_products LIMIT 1) AS products,
      (SELECT 1 FROM user_records LIMIT 1) AS records, (SELECT 1 FROM stripe_events LIMIT 1) AS stripe_events`).get());
  } finally { sqlite.close(); }
});

test('D1 capacity and merge SQL execute against SQLite', async () => {
  const { sqlite } = await createD1SQLite();
  try {
    sqlite.prepare('INSERT INTO users (clerk_id, email, email_verified, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
      .run('user_sqlite', 'sqlite@example.com', '2026-10-15', '2026-10-15');
    const oversizedCyclePayload = 'x'.repeat(750_001);
    assert.throws(() => sqlite.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      VALUES ('oversized', 'user_sqlite', 'cycle', '2026-10-15', '{}', ?, 1, 'created', 'updated')`).run(oversizedCyclePayload), /cloud_cycle_too_large/);
    sqlite.prepare('INSERT INTO users (clerk_id, email, email_verified, migration_status, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)')
      .run('user_migrating', 'migrating@example.com', 'migrating', '2026-10-15', '2026-10-15');
    const importCycle = sqlite.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, migration_import, created_at, updated_at)
      VALUES (?, 'user_migrating', 'cycle', '2026-10-15', '{}', '{}', 2, 1, 'created', 'updated')`);
    for (let index = 0; index < 101; index += 1) importCycle.run(`import-${index}`);
    const concurrentNormalWrite = sqlite.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      VALUES ('concurrent', 'user_migrating', 'cycle', '2026-10-15', '{}', '{}', 2, 'created', 'updated')`);
    assert.doesNotThrow(() => concurrentNormalWrite.run());
    const activeCycleWrite = sqlite.prepare("INSERT INTO cloud_cycles (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at) VALUES (?, 'user_migrating', 'cycle', '2026-10-15', '{}', '{}', 2, 'created', 'updated')");
    for (let index = 0; index < 99; index += 1) activeCycleWrite.run(`active-${index}`);
    assert.throws(() => activeCycleWrite.run('active-over-limit'), /cloud_cycle_quota_reached/);

    const metricInsert = sqlite.prepare(`INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id)
      VALUES (?, ?, ?, ?, ?)`);
    for (let index = 0; index < 500; index += 1) {
      metricInsert.run(`event-${index}`, '2026-10-15', 'installation-123', 'account_signin', 'user_sqlite');
    }
    assert.throws(() => metricInsert.run('event-over-limit', '2026-10-15', 'installation-123', 'account_signin', 'user_sqlite'), /product_metric_daily_quota_reached/);

    sqlite.prepare(`INSERT INTO user_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_settings.data_json), updated_at = excluded.updated_at`)
      .run('user_sqlite', JSON.stringify({ theme: 'local' }), '2026-10-15');
    sqlite.prepare(`INSERT INTO user_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_settings.data_json), updated_at = excluded.updated_at`)
      .run('user_sqlite', JSON.stringify({ legacy: true, theme: 'legacy' }), '2026-10-15');
    assert.deepStrictEqual(JSON.parse(sqlite.prepare('SELECT data_json FROM user_settings WHERE user_id = ?').get('user_sqlite').data_json), { legacy: true, theme: 'local' });

    const cycleWrite = sqlite.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM cloud_cycles WHERE user_id = ? AND id = ?)
        OR (SELECT COUNT(*) FROM cloud_cycles WHERE user_id = ? AND migration_import = 0) < ?
      ON CONFLICT(user_id, id) DO UPDATE SET label = excluded.label, cycle_date = excluded.cycle_date,
        metadata_json = json_set(excluded.metadata_json, '$.createdAt', COALESCE(json_extract(cloud_cycles.metadata_json, '$.createdAt'), json_extract(excluded.metadata_json, '$.createdAt'))),
        payload_json = excluded.payload_json, payload_bytes = excluded.payload_bytes, updated_at = excluded.updated_at`);
    const runCycleWrite = (id, limit) => cycleWrite.run(id, 'user_sqlite', id, '2026-10-15', '{}', '{}', 2, 'created', 'updated', 'user_sqlite', id, 'user_sqlite', limit);
    runCycleWrite('cycle-1', 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_cycles WHERE user_id = ?').get('user_sqlite').count, 1);
    const noOpRetry = runCycleWrite('cycle-1', 1);
    assert.equal(noOpRetry.changes, 1);
    runCycleWrite('cycle-2', 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_cycles WHERE user_id = ?').get('user_sqlite').count, 1);
    const directCycle = sqlite.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      VALUES (?, ?, ?, ?, '{}', '{}', 2, 'created', 'updated')`);
    for (let index = 1; index < 100; index += 1) directCycle.run(`cycle-${index + 1}`, 'user_sqlite', 'cycle', '2026-10-15');
    assert.throws(() => directCycle.run('cycle-over-limit', 'user_sqlite', 'cycle', '2026-10-15'), /cloud_cycle_quota_reached/);
    assert.throws(() => sqlite.prepare('UPDATE cloud_cycles SET payload_bytes = ? WHERE user_id = ? AND id = ?').run(750001, 'user_sqlite', 'cycle-1'), /cloud_cycle_too_large/);

    const slots = Array.from({ length: 2 }, (_, index) => `('product-${String(index + 1).padStart(2, '0')}')`).join(', ');
    const insertSlot = sqlite.prepare(`WITH slots(slot_id) AS (VALUES ${slots})
      INSERT INTO custom_products (user_id, slot_id, product_id, data_json)
      SELECT ?, slots.slot_id, ?, ? FROM slots
      WHERE NOT EXISTS (SELECT 1 FROM custom_products WHERE user_id = ? AND slot_id = slots.slot_id)
        AND (SELECT COUNT(*) FROM custom_products WHERE user_id = ? AND migration_import = 0) < ?
      ORDER BY slots.slot_id LIMIT 1`);
    insertSlot.run('user_sqlite', 'one', '{}', 'user_sqlite', 'user_sqlite', 2);
    insertSlot.run('user_sqlite', 'two', '{}', 'user_sqlite', 'user_sqlite', 2);
    assert.equal(insertSlot.run('user_sqlite', 'three', '{}', 'user_sqlite', 'user_sqlite', 2).changes, 0);
    const directProduct = sqlite.prepare('INSERT INTO custom_products (user_id, slot_id, product_id, data_json) VALUES (?, ?, ?, ?)');
    for (let index = 2; index < 16; index += 1) directProduct.run('user_sqlite', `product-${index + 1}`, `product-${index + 1}`, '{}');
    assert.throws(() => directProduct.run('user_sqlite', 'product-17', 'product-17', '{}'), /custom_product_quota_reached/);

    const recordWrite = sqlite.prepare(`INSERT INTO user_records (user_id, record_type, record_id, data_json, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_records WHERE user_id = ? AND record_type = ? AND record_id = ?)
        OR (SELECT COUNT(*) FROM user_records WHERE user_id = ? AND record_type = ?) < ?
      ON CONFLICT(user_id, record_type, record_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`);
    const runRecordWrite = (id) => recordWrite.run('user_sqlite', 'forecast', id, '{}', 'created', 'updated', 'user_sqlite', 'forecast', id, 'user_sqlite', 'forecast', 200);
    assert.equal(runRecordWrite('forecast-save').changes, 1);
    assert.equal(runRecordWrite('forecast-save').changes, 1);
    const directRecord = sqlite.prepare(`INSERT INTO user_records (user_id, record_type, record_id, data_json, created_at, updated_at) VALUES (?, ?, ?, '{}', 'created', 'updated')`);
    for (let index = 0; index < 199; index += 1) directRecord.run('user_sqlite', 'forecast', `forecast-${index}`);
    assert.equal(runRecordWrite('forecast-over-limit').changes, 0);
    assert.throws(() => directRecord.run('user_sqlite', 'forecast', 'forecast-over-limit'), /user_record_quota_reached/);

    const awarenessWrite = sqlite.prepare('INSERT INTO workflow_awareness (user_id, cycle_id, data_json) VALUES (?, ?, ?)');
    for (let index = 0; index < 200; index += 1) awarenessWrite.run('user_sqlite', `cycle-${index}`, '{}');
    assert.throws(() => awarenessWrite.run('user_sqlite', 'cycle-over-limit', '{}'), /workflow_awareness_quota_reached/);
    assert.throws(() => awarenessWrite.run('user_sqlite', 'oversized', JSON.stringify({ value: 'x'.repeat(750_001) })), /workflow_awareness_too_large/);

    const insertMetric = sqlite.prepare('INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id) VALUES (?, ?, ?, ?, ?)');
    const today = new Date().toISOString().slice(0, 10);
    insertMetric.run('evt-1', today, 'install-1', 'cloud_cycle_saved', 'user_sqlite');
    insertMetric.run('evt-2', today, 'install-1', 'cloud_cycle_saved', 'user_sqlite');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM product_metric_events').get().count, 502);
    const reportRows = sqlite.prepare(`SELECT event_date AS date, COUNT(DISTINCT CASE WHEN event_type NOT IN ('upgrades', 'cancellations') THEN installation_id END) AS activeDevices,
      COUNT(DISTINCT user_id) AS activeSignedInAccounts,
      SUM(CASE WHEN event_type = 'account_signup' THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN event_type = 'account_signin' THEN 1 ELSE 0 END) AS signIns,
      SUM(CASE WHEN event_type = 'upgrades' THEN 1 ELSE 0 END) AS upgrades,
      SUM(CASE WHEN event_type = 'cancellations' THEN 1 ELSE 0 END) AS cancellations,
      SUM(CASE WHEN event_type IN ('cloud_cycle_saved', 'cycle_saved') THEN 1 ELSE 0 END) AS cloudSaves,
      SUM(CASE WHEN event_type = 'cloud_cycle_loaded' THEN 1 ELSE 0 END) AS cloudLoads
      FROM product_metric_events WHERE event_date >= date('now', ?) GROUP BY event_date ORDER BY event_date ASC`).all('-30 days');
    assert.equal(reportRows.at(-1).activeDevices, 1);
    assert.equal(reportRows.at(-1).activeSignedInAccounts, 1);
    assert.equal(reportRows.at(-1).cloudSaves, 2);

    sqlite.prepare('INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)')
      .run('user_sqlite', JSON.stringify({ billingStatus: 'active' }), today);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM user_entitlements WHERE json_extract(data_json, '$.billingStatus') IN ('active', 'trialing')").get().count, 1);

    sqlite.prepare('INSERT INTO stripe_events (event_id, processed_at, status) VALUES (?, ?, ?)').run('evt-pending', today, 'processing');
    sqlite.prepare('UPDATE stripe_events SET status = ?, processed_at = ? WHERE event_id = ?').run('completed', today, 'evt-pending');
    assert.equal(sqlite.prepare('SELECT status FROM stripe_events WHERE event_id = ?').get('evt-pending').status, 'completed');
  } finally {
    sqlite.close();
  }
});

test('workflow awareness rejects invalid and over-quota writes and returns persisted envelopes', async () => {
  const db = new D1Mock();
  await withClerkFetch(async () => {
    const invalid = await call('/api/workflow-awareness', createEnv(db), {
      method: 'PUT', body: { record: { metadata: { cycleId: '' } } },
    });
    assert.equal(invalid.status, 400);
    const record = { consentVersion: 1, schemaVersion: 1, metadata: { cycleId: ' cycle-1 ' } };
    const saved = await call('/api/workflow-awareness', createEnv(db), { method: 'PUT', body: { record } });
    assert.equal(saved.status, 200);
    const wrongAccount = await call('/api/workflow-awareness?userId=another-user', createEnv(db));
    assert.equal(wrongAccount.status, 403);
    const list = await call('/api/workflow-awareness', createEnv(db));
    assert.deepStrictEqual((await list.json()).records, [{ ...record, metadata: { cycleId: 'cycle-1' } }]);
    for (let index = 1; index <= 200; index += 1) {
      db.workflowAwareness.set(`user_beta_test:cycle-${index}`, { user_id: 'user_beta_test', cycle_id: `cycle-${index}`, data_json: '{}' });
    }
    const lastPage = await call('/api/workflow-awareness?page=19', createEnv(db));
    const lastPageBody = await lastPage.json();
    assert.equal(lastPageBody.records.length, 10);
    assert.equal(lastPageBody.nextPage, 20);
    const emptyPage = await call('/api/workflow-awareness?page=20', createEnv(db));
    assert.deepStrictEqual(await emptyPage.json(), { records: [], nextPage: null });
    const overQuota = await call('/api/workflow-awareness', createEnv(db), {
      method: 'PUT', body: { record: { metadata: { cycleId: 'cycle-over-limit' } } },
    });
    assert.equal(overQuota.status, 409);
    const updateExisting = await call('/api/workflow-awareness', createEnv(db), { method: 'PUT', body: { record } });
    assert.equal(updateExisting.status, 200);
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

test('custom product creation retries a concurrent slot collision', async () => {
  const db = new D1Mock();
  db.failNextCustomProductSlotInsert = true;
  await withClerkFetch(async () => {
    const response = await call('/api/custom-products', createEnv(db), { method: 'POST', body: {
      product: { id: 'race-product', userId: 'user_beta_test', version: 1 },
    } });
    assert.equal(response.status, 200);
    assert.equal(db.customProducts.get('user_beta_test:product-01')?.product_id, 'race-product');
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
    assert.deepStrictEqual(await response.json(), { url: 'https://checkout.stripe.test/session' });
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
    assert.equal(data.summary.activeDevices, 1);
    assert.equal(data.summary.signups, 1);
    assert.equal(data.summary.signIns, 2);
  });
});

test('forecast, discussion, verification and settings endpoints enforce account-scoped CRUD', async () => {
  const env = createEnv();
  await withClerkFetch(async () => {
    const emptyId = await call('/api/forecasts', env, { method: 'PUT', body: { id: '   ', data: {} } });
    assert.equal(emptyId.status, 400);
    for (const [route, id] of [['forecasts', 'forecast-1'], ['discussions', 'discussion-1'], ['verifications', 'verification-1']]) {
      const write = await call(`/api/${route}`, env, { method: 'PUT', body: { id, data: { value: route } } });
      assert.equal(write.status, 200);
      const list = await call(`/api/${route}`, env);
      assert.deepStrictEqual((await list.json()).records.map((record) => record.id), [id]);
      const read = await call(`/api/${route}/${id}`, env);
      assert.equal((await read.json()).record.data.value, route);
      const remove = await call(`/api/${route}/${id}`, env, { method: 'DELETE' });
      assert.equal(remove.status, 200);
      assert.deepStrictEqual((await (await call(`/api/${route}`, env)).json()).records, []);
    }
    const settingsWrite = await call('/api/user/settings', env, { method: 'PUT', body: { settings: { darkMode: true } } });
    assert.equal(settingsWrite.status, 200);
    const settingsRead = await call('/api/user/settings', env);
    assert.deepStrictEqual((await settingsRead.json()).settings, { darkMode: true });
  });
});

test('forecast, discussion and verification writes enforce their per-account record quota', async () => {
  const db = new D1Mock();
  const env = createEnv(db);
  for (let index = 0; index < 200; index += 1) {
    const id = `forecast-${index}`;
    db.records.set(`user_beta_test:forecast:${id}`, {
      user_id: 'user_beta_test', record_type: 'forecast', record_id: id,
      data_json: '{}', created_at: '2026-10-01', updated_at: '2026-10-01',
    });
  }
  const response = await withClerkFetch(() => call('/api/forecasts', env, { method: 'PUT', body: { id: 'forecast-over-limit', data: {} } }));
  assert.equal(response.status, 409);
  assert.deepStrictEqual(await response.json(), { error: 'Record quota reached.' });
});

test('authenticated JSON writes reject oversized request bodies before parsing', async () => {
  const env = createEnv();
  const response = await withClerkFetch(() => worker.fetch(new Request('https://beta.gfcweather.com/api/user/settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${createToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { value: 'x'.repeat(750_001) } }),
  }), env));
  assert.equal(response.status, 413);
  assert.deepStrictEqual(await response.json(), { error: 'Request body is too large.' });
});

test('product metrics reject malformed JSON with a client error', async () => {
  const response = await withClerkFetch(() => worker.fetch(new Request('https://beta.gfcweather.com/api/metrics/event', {
    method: 'POST',
    headers: { Authorization: `Bearer ${createToken()}`, 'Content-Type': 'application/json' },
    body: '{',
  }), createEnv()));
  assert.equal(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'Invalid product metric event.' });
});

test('product metrics return a rate limit when the per-user daily quota is exhausted', async () => {
  const db = new D1Mock();
  const today = new Date().toISOString().slice(0, 10);
  for (let index = 0; index < MAX_PRODUCT_METRIC_DAILY_EVENTS; index += 1) {
    db.metricEvents.add(`existing-${index}:${today}:install-123:account_signin:user_beta_test`);
  }
  const response = await withClerkFetch(() => call('/api/metrics/event', createEnv(db), {
    method: 'POST', body: { event: 'account_signin', installationId: 'install-new-123' },
  }));
  assert.equal(response.status, 429);
  assert.deepStrictEqual(await response.json(), { error: 'Daily metrics event limit reached.' });
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
  assert.deepStrictEqual(await first.json(), { received: true });
  const duplicate = await send();
  assert.equal(duplicate.status, 200);
  assert.deepStrictEqual(await duplicate.json(), { received: true, duplicate: true });
});

test('Stripe webhook recovers a stale processing claim and processes the delivery', async () => {
  const db = new D1Mock();
  db.stripeEvents.set('evt_stale_claim', { status: 'processing', processed_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() });
  const env = { ...createEnv(db), STRIPE_WEBHOOK_SECRET: 'whsec_beta_test' };
  const raw = JSON.stringify({ id: 'evt_stale_claim', type: 'customer.updated', data: { object: {} } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');

  const response = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
    method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
  }), env);

  assert.equal(response.status, 200);
  assert.deepStrictEqual(await response.json(), { received: true });
  assert.equal(db.stripeEvents.get('evt_stale_claim').status, 'completed');
});

test('Stripe subscription events remain retryable until the Clerk user exists', async () => {
  const db = new D1Mock();
  const env = { ...createEnv(db), STRIPE_WEBHOOK_SECRET: 'whsec_beta_test' };
  const raw = JSON.stringify({ id: 'evt_unprovisioned', type: 'customer.subscription.updated', data: { object: {
    id: 'sub_unprovisioned', status: 'active', metadata: { clerkId: 'not-created-yet' },
  } } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
  const response = await withClerkFetch(() => worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
    method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
  }), env));
  assert.equal(response.status, 503);
  assert.equal(db.stripeEvents.get('evt_unprovisioned').status, 'processing');
  const earlyRetry = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
    method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
  }), env);
  assert.equal(earlyRetry.status, 503);

  db.users.set('not-created-yet', { clerk_id: 'not-created-yet', email: 'beta@example.com', beta_access: 1 });
  const claim = db.stripeEvents.get('evt_unprovisioned');
  claim.processed_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const retry = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
    method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
  }), env);
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.equal(db.stripeEvents.get('evt_unprovisioned').status, 'completed');
  assert.equal(JSON.parse(db.entitlements.get('not-created-yet')).billingStatus, 'active');
});

test('Stripe webhook acknowledges missing metadata and deleted Clerk accounts', async () => {
  const db = new D1Mock();
  const env = { ...createEnv(db), STRIPE_WEBHOOK_SECRET: 'whsec_beta_test' };
  const send = async (event) => {
    const raw = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
    const action = () => worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
      method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
    }), env);
    return await action();
  };
  const missing = await send({ id: 'evt_missing_owner', type: 'customer.subscription.updated', data: { object: {} } });
  assert.equal(missing.status, 200);
  assert.equal((await missing.json()).ignored, 'missing-account-metadata');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input) === 'https://api.clerk.com/v1/users/deleted-user'
    ? new Response(null, { status: 404 })
    : originalFetch(input, init);
  try {
    const deleted = await send({ id: 'evt_deleted_owner', type: 'customer.subscription.deleted', data: { object: {
      id: 'sub_deleted', status: 'canceled', metadata: { clerkId: 'deleted-user' },
    } } });
    assert.equal(deleted.status, 200);
    assert.equal((await deleted.json()).ignored, 'deleted-account');
  } finally { globalThis.fetch = originalFetch; }
});

test('Stripe webhook retries when Clerk rejects a temporary or misconfigured lookup', async () => {
  const env = { ...createEnv(new D1Mock()), STRIPE_WEBHOOK_SECRET: 'whsec_beta_test' };
  const raw = JSON.stringify({ id: 'evt_clerk_denied', type: 'customer.subscription.updated', data: { object: {
    id: 'sub_clerk_denied', status: 'active', metadata: { clerkId: 'clerk-user' },
  } } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input) === 'https://api.clerk.com/v1/users/clerk-user'
    ? new Response(null, { status: 401 })
    : originalFetch(input, init);
  try {
    const response = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
      method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
    }), env);
    assert.equal(response.status, 500);
    assert.equal(env.DB.stripeEvents.get('evt_clerk_denied').status, 'processing');
  } finally { globalThis.fetch = originalFetch; }
});

test('Stripe webhook rejects malformed JSON even when its signature is valid', async () => {
  const raw = '{';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', 'whsec_beta_test').update(`${timestamp}.${raw}`).digest('hex');
  const response = await worker.fetch(new Request('https://beta.gfcweather.com/api/billing/webhook', {
    method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw,
  }), { ...createEnv(), STRIPE_WEBHOOK_SECRET: 'whsec_beta_test' });
  assert.equal(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'Invalid webhook payload.' });
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
