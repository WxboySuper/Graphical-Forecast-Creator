import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import worker from './feedback-worker.mjs';
import { LIMITS, MAX_BODY_BYTES } from './feedback/store.mjs';

const project = 'gfc-test';
const accessDomain = 'test.cloudflareaccess.com';
const accessAud = 'access-aud';
let privateKey;
let jwk;

const b64 = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
function isDuplicateRow(row, args) {
  if (row.uid_hash !== args[0]) return false;
  if (row.message !== args[1]) return false;
  return row.created_at > args[2];
}

async function token(overrides = {}, key = privateKey, kid = 'test-key') {
  const header = b64({ alg: 'RS256', kid });
  const payload = b64({ iss: `https://securetoken.google.com/${project}`, aud: project, exp: 2000000000, iat: 1900000000, auth_time: 1900000000, sub: 'user-123', email: 'user@example.com', email_verified: true, ...overrides });
  const message = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message));
  return `${message}.${Buffer.from(signature).toString('base64url')}`;
}

async function accessToken(overrides = {}, key = privateKey, kid = 'test-key') {
  const header = b64({ alg: 'RS256', kid });
  const payload = b64({ iss: `https://${accessDomain}`, aud: [accessAud], exp: 2000000000, iat: 1900000000, sub: 'owner-123', email: 'owner@example.com', ...overrides });
  const message = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message));
  return `${message}.${Buffer.from(signature).toString('base64url')}`;
}

/** Mirrors the SQL column list so tests see exactly the columns the Worker selects. */
function selectColumns(row, sql) {
  const match = sql.match(/^SELECT (.*?) FROM feedback/);
  assert.ok(match, `selectColumns: unsupported SQL: ${sql}`);
  const columns = match[1].split(', ');
  return Object.fromEntries(columns.map((column) => [column, row[column]]));
}

class FakeD1 {
  rows = [];
  adminAttempts = new Map();
  firstHandlers = [
    { matches: (sql) => sql === 'SELECT COUNT(*) AS total FROM feedback', run: (db) => ({ total: db.rows.length }) },
    { matches: (sql) => sql.startsWith('SELECT SUM'), run: (db, args) => {
      const [recentSince, dailySince, recentAtSince, dailyAtSince, uid] = args;
      const mine = db.rows.filter((row) => row.uid_hash === uid);
      const recent = mine.filter((row) => row.created_at > recentSince);
      const daily = mine.filter((row) => row.created_at > dailySince);
      return { recent: recent.length, daily: daily.length, recent_at: Math.max(0, ...mine.filter((row) => row.created_at > recentAtSince).map((row) => row.created_at)), daily_at: Math.max(0, ...mine.filter((row) => row.created_at > dailyAtSince).map((row) => row.created_at)) };
    } },
    { matches: (sql) => sql.includes('AND message = ?'), run: (db, args) => db.rows.find((row) => isDuplicateRow(row, args)) ?? null },
    { matches: (sql) => sql.includes('FROM feedback_admin_attempts'), run: (db, args) => db.adminAttempts.get(args[0]) ?? null },
    { matches: (sql) => sql.includes('FROM feedback WHERE id = ?'), run: (db, args, sql) => {
      const row = db.rows.find((item) => item.id === args[0]);
      return row ? selectColumns(row, sql) : null;
    } },
  ];
  runHandlers = [
    { matches: (sql) => sql === 'DELETE FROM feedback WHERE id = ?', run: (db, args) => {
      const index = db.rows.findIndex((row) => row.id === args[0]);
      if (index < 0) return { meta: { changes: 0 } };
      db.rows.splice(index, 1);
      return { meta: { changes: 1 } };
    } },
    { matches: (sql) => sql.startsWith('INSERT INTO feedback_admin_attempts'), run: (db, args) => {
      const [key, now] = args;
      const current = db.adminAttempts.get(key);
      db.adminAttempts.set(key, !current || current.window_started + 600000 <= now ? { window_started: now, attempts: 1 } : { ...current, attempts: current.attempts + 1 });
      return { meta: { changes: 1 } };
    } },
    { matches: (sql) => sql.startsWith('DELETE FROM feedback_admin_attempts WHERE window_started'), run: (db, args) => {
      let removed = 0;
      for (const [key, value] of db.adminAttempts) if (value.window_started <= args[0]) { db.adminAttempts.delete(key); removed += 1; }
      return { meta: { changes: removed } };
    } },
    { matches: (sql) => sql.startsWith('DELETE FROM feedback_admin_attempts WHERE key_hash'), run: (db, args) => ({ meta: { changes: Number(db.adminAttempts.delete(args[0])) } }) },
    { matches: (sql) => sql.startsWith('INSERT INTO feedback ('), run: (db, args) => {
      const [id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, user_agent, discord_status, ...guards] = args;
      const [, recentSince, , dailySince, , , dupSince, globalSince] = guards;
      const mine = db.rows.filter((row) => row.uid_hash === uid_hash);
      const blocked = mine.filter((row) => row.created_at > recentSince).length >= LIMITS.recent
        || mine.filter((row) => row.created_at > dailySince).length >= LIMITS.daily
        || mine.some((row) => row.message === message && row.created_at > dupSince)
        || db.rows.filter((row) => row.created_at > globalSince).length >= LIMITS.global;
      if (blocked) return { meta: { changes: 0 } };
      db.rows.push({ id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, user_agent, discord_status, status: 'new' });
      return { meta: { changes: 1 } };
    } },
    { matches: (sql) => sql.startsWith('UPDATE feedback SET discord_status'), run: (db, args) => {
      const row = db.rows.find((item) => item.id === args[1]);
      if (row) row.discord_status = args[0];
      return { meta: { changes: row ? 1 : 0 } };
    } },
    { matches: (sql) => sql.startsWith('UPDATE feedback SET status'), run: (db, args) => {
      const row = db.rows.find((item) => item.id === args[1]);
      if (row) row.status = args[0];
      return { meta: { changes: row ? 1 : 0 } };
    } },
  ];
  allHandlers = [
    { matches: (sql) => sql.startsWith('SELECT status AS value, COUNT(*) AS count FROM feedback GROUP BY status'), run: (db) => groupedRows(db.rows, 'status') },
    { matches: (sql) => sql.startsWith('SELECT build_target AS value, COUNT(*) AS count FROM feedback GROUP BY build_target'), run: (db) => groupedRows(db.rows, 'build_target') },
    { matches: (sql) => sql.startsWith('SELECT category AS value, COUNT(*) AS count FROM feedback GROUP BY category'), run: (db) => groupedRows(db.rows, 'category') },
    { matches: (sql) => sql.startsWith('SELECT id, created_at') && sql.includes('FROM feedback'), run: (db, sql, args) => {
      const predicates = sql.match(/WHERE (.*?) ORDER BY/)?.[1]?.split(' AND ') ?? [];
      const filters = [
        { predicate: 'status = ?', apply: (state) => ({ rows: state.rows.filter((row) => row.status === args[state.index]), index: state.index + 1 }) },
        { predicate: 'build_target = ?', apply: (state) => ({ rows: state.rows.filter((row) => row.build_target === args[state.index]), index: state.index + 1 }) },
        { predicate: 'category = ?', apply: (state) => ({ rows: state.rows.filter((row) => row.category === args[state.index]), index: state.index + 1 }) },
        { predicate: 'created_at >= ?', apply: (state) => ({ rows: state.rows.filter((row) => row.created_at >= args[state.index]), index: state.index + 1 }) },
        { predicate: '(created_at, id) < (?, ?)', apply: (state) => {
          const [time, id] = args.slice(state.index, state.index + 2);
          const rows = state.rows.filter((row) => row.created_at < time || (row.created_at === time && row.id < id));
          return { rows, index: state.index + 2 };
        } },
      ];
      const activeFilters = filters.filter((filter) => predicates.includes(filter.predicate));
      const { rows } = activeFilters.reduce((state, filter) => filter.apply(state), { rows: [...db.rows], index: 0 });
      rows.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? 1 : -1));
      return { results: rows.slice(0, args.at(-1)).map((row) => selectColumns(row, sql)) };
    } },
  ];

  prepare(sql) {
    let args = [];
    const firstHandler = this.firstHandlers.find((handler) => handler.matches(sql));
    const allHandler = this.allHandlers.find((handler) => handler.matches(sql));
    const runHandler = this.runHandlers.find((handler) => handler.matches(sql));
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() {
        assert.ok(firstHandler, `FakeD1.first: no handler for SQL: ${sql}`);
        return firstHandler.run(db, args, sql);
      },
      async all() {
        assert.ok(allHandler, `FakeD1.all: no handler for SQL: ${sql}`);
        return allHandler.run(db, sql, args);
      },
      async run() {
        assert.ok(runHandler, `FakeD1.run: no handler for SQL: ${sql}`);
        return runHandler.run(db, args);
      },
    };
    return statement;
  }
}

function groupedRows(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return { results: [...counts].map(([value, count]) => ({ value, count })) };
}

const validBody = (overrides = {}) => ({ category: 'bug', message: 'This is a detailed report.', page: '/forecast?secret=1#map', appVersion: '1.2.3', buildTarget: 'beta', contactOk: false, ...overrides });
function harness(options = {}) {
  const db = options.db ?? new FakeD1();
  const waits = [];
  const env = { FIREBASE_PROJECT_ID: project, FEEDBACK_HASH_SALT: 'pepper', FEEDBACK_ALLOWED_ORIGINS: 'https://beta.gfcweather.com,http://localhost:3000', FEEDBACK_DB: db, NOW: () => 1950000000000, JWKS_FETCH: async () => Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=300' } }), ...options.env };
  const ctx = { waitUntil(promise) { waits.push(promise); } };
  return { db, env, ctx, waits };
}
async function viewerRequest(env, ctx, path, { method = 'GET', auth, headers = {}, body } = {}) {
  const response = await worker.fetch(new Request(`https://feedback.gfcweather.com${path}`, {
    method,
    headers: { ...(auth ? { 'cf-access-jwt-assertion': auth } : {}), ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, ctx);
  assert.ok(![...response.headers.keys()].some((name) => name.startsWith('access-control-')), `admin response must omit CORS headers: ${path}`);
  return response;
}
async function post(env, ctx, { body = validBody(), auth = null, origin = 'https://beta.gfcweather.com' } = {}) {
  return worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback', { method: 'POST', headers: { ...(origin ? { origin } : {}), ...(auth ? { authorization: `Bearer ${auth}` } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, ctx);
}

before(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  privateKey = pair.privateKey;
  jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = 'test-key'; jwk.alg = 'RS256';
});

test('health and origin policy', async () => {
  const { env, ctx } = harness();
  assert.deepStrictEqual(await (await worker.fetch(new Request('https://feedback.gfcweather.com/health'), env, ctx)).json(), { ok: true });
  const preflight = await worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback', { method: 'OPTIONS', headers: { origin: 'https://beta.gfcweather.com' } }), env, ctx);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://beta.gfcweather.com');
  const denied = await post(env, ctx, { body: validBody(), auth: await token(), origin: 'https://evil.example' });
  assert.equal(denied.status, 403); assert.equal(denied.headers.has('access-control-allow-origin'), false);
});

test('rejects missing, expired, wrong-audience, and bad-signature Firebase tokens', async () => {
  const { env, ctx } = harness();
  assert.equal((await post(env, ctx)).status, 401);
  assert.equal((await post(env, ctx, { body: validBody(), auth: await token({ exp: 1 }) })).status, 401);
  assert.equal((await post(env, ctx, { body: validBody(), auth: await token({ aud: 'wrong' }) })).status, 401);
  const wrong = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  assert.equal((await post(env, ctx, { body: validBody(), auth: await token({}, wrong.privateKey) })).status, 401);
});

test('validates fields and body size', async () => {
  const { env, ctx } = harness(); const auth = await token();
  assert.equal((await post(env, ctx, { body: validBody({ category: 'unknown' }), auth })).status, 400);
  assert.equal((await post(env, ctx, { body: validBody({ extra: true }), auth })).status, 400);
  assert.equal((await post(env, ctx, { body: validBody({ message: 'short' }), auth })).status, 400);
  assert.equal((await post(env, ctx, { body: validBody({ message: 'a\n b\t c' }), auth })).status, 400);
  assert.equal((await post(env, ctx, { body: validBody({ page: ' \n\t ' }), auth })).status, 400);
  assert.equal((await post(env, ctx, { body: validBody({ appVersion: '\n\t ' }), auth })).status, 400);
  const big = new Request('https://feedback.gfcweather.com/v1/feedback', { method: 'POST', headers: { authorization: `Bearer ${auth}`, origin: 'https://beta.gfcweather.com', 'content-type': 'application/json' }, body: 'x'.repeat(MAX_BODY_BYTES + 1000) });
  assert.equal((await worker.fetch(big, env, ctx)).status, 413);
  const streamed = new Request('https://feedback.gfcweather.com/v1/feedback', {
    method: 'POST',
    headers: { authorization: `Bearer ${auth}`, origin: 'https://beta.gfcweather.com', 'content-type': 'application/json' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9000)); controller.enqueue(new Uint8Array(9000)); controller.close(); } }),
    duplex: 'half',
  });
  assert.equal((await worker.fetch(streamed, env, ctx)).status, 413);
});

test('hashes uid, strips query and hash, and stores email only with contact consent', async () => {
  const { db, env, ctx } = harness(); const auth = await token();
  assert.equal((await post(env, ctx, { body: validBody(), auth })).status, 201);
  assert.equal(db.rows[0].page, '/forecast'); assert.equal(db.rows[0].email, null);
  assert.notEqual(db.rows[0].uid_hash, 'user-123');
  assert.equal((await post(env, ctx, { body: validBody({ message: 'A distinct helpful note.', contactOk: true }), auth })).status, 201);
  assert.equal(db.rows[1].email, 'user@example.com');
  const unverified = await token({ email_verified: false, sub: 'user-unverified' });
  assert.equal((await post(env, ctx, { body: validBody({ message: 'Another distinct helpful note.', contactOk: true }), auth: unverified })).status, 201);
  assert.equal(db.rows[2].email, null);
});

test('enforces duplicate and rolling-window rate limits', async () => {
  const { env, ctx } = harness(); const auth = await token();
  assert.equal((await post(env, ctx, { body: validBody(), auth })).status, 201);
  assert.equal((await post(env, ctx, { body: validBody(), auth })).status, 429);
  for (let i = 1; i < 5; i += 1) assert.equal((await post(env, ctx, { body: validBody({ message: `A separate message number ${i}.` }), auth })).status, 201);
  const limited = await post(env, ctx, { body: validBody({ message: 'Yet another separate report.' }), auth });
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);

  let now = 1950000000000;
  const daily = harness({ env: { NOW: () => now } });
  for (let i = 0; i < 20; i += 1) {
    const response = await post(daily.env, daily.ctx, { body: validBody({ message: `A daily report number ${i.toString().padStart(2, '0')}.` }), auth });
    assert.equal(response.status, 201);
    now += 11 * 60 * 1000;
  }
  assert.equal((await post(daily.env, daily.ctx, { body: validBody({ message: 'The daily limit has now been reached.' }), auth })).status, 429);
});

test('concurrent submissions cannot exceed the rate limit or duplicate rule', async () => {
  const { db, env, ctx } = harness(); const auth = await token();
  const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => post(env, ctx, { body: validBody({ message: `Concurrent report number ${i}.` }), auth })));
  assert.equal(burst.filter((response) => response.status === 201).length, 5);
  assert.ok(burst.filter((response) => response.status !== 201).every((response) => response.status === 429 && Number(response.headers.get('retry-after')) > 0));
  assert.equal(db.rows.length, 5);

  const twin = harness(); const twinAuth = await token({ sub: 'user-456' });
  const same = await Promise.all(Array.from({ length: 4 }, () => post(twin.env, twin.ctx, { body: validBody(), auth: twinAuth })));
  assert.deepStrictEqual(same.map((response) => response.status).sort(), [201, 429, 429, 429]);
  assert.equal(twin.db.rows.length, 1);
});

test('Discord success, failure, and disabled states do not change acceptance', async () => {
  for (const [fetcher, expected] of [[async () => new Response('{}', { status: 200 }), 'sent'], [async () => new Response('no', { status: 500 }), 'failed']]) {
    const { db, env, ctx, waits } = harness({ env: { FEEDBACK_DISCORD_WEBHOOK_URL: 'https://discord.example/webhook', FETCH: fetcher } });
    const response = await post(env, ctx, { body: validBody({ message: '@everyone this is a detailed issue report.' }), auth: await token() });
    assert.equal(response.status, 201); await Promise.all(waits);
    assert.equal(db.rows[0].discord_status, expected);
  }
  const { db, env, ctx } = harness();
  assert.equal((await post(env, ctx, { body: validBody(), auth: await token() })).status, 201);
  assert.equal(db.rows[0].discord_status, 'disabled');
});

test('admin read and patch require the configured token', async () => {
  const { db, env, ctx } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret' } });
  await post(env, ctx, { body: validBody(), auth: await token() }); const id = db.rows[0].id;
  const request = (method, path, body) => worker.fetch(new Request(`https://feedback.gfcweather.com${path}`, { method, headers: { authorization: 'Bearer admin-secret', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  assert.equal((await request('GET', `/v1/feedback/${id}`)).status, 200);
  const list = await (await request('GET', '/v1/feedback?limit=1')).json(); assert.equal(list.items.length, 1);
  assert.equal((await request('PATCH', `/v1/feedback/${id}`, { status: 'triaged' })).status, 200);
  assert.equal((await request('PATCH', `/v1/feedback/${id}`, { status: 'other' })).status, 400);
  assert.equal((await worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback', { headers: { authorization: 'Bearer wrong' } }), env, ctx)).status, 401);
  const unavailable = harness();
  assert.equal((await worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback'), unavailable.env, unavailable.ctx)).status, 503);
});

test('admin list validates filters and paginates filtered results', async () => {
  const { db, env, ctx } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret' } });
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'];
  db.rows = ids.map((id, index) => ({
    id, created_at: 1000 - index * 100, uid_hash: 'hash', email: null,
    category: index % 2 ? 'idea' : 'bug', message: `feedback ${index}`, page: '/',
    app_version: '1.0', build_target: index < 3 ? 'beta' : 'production', plan: null,
    viewport: null, user_agent: '', status: index < 3 ? 'new' : 'resolved', discord_status: 'disabled',
  }));
  const request = (path, ip = '192.0.2.1') => worker.fetch(new Request(`https://feedback.gfcweather.com${path}`, { headers: { authorization: 'Bearer admin-secret', 'CF-Connecting-IP': ip } }), env, ctx);
  for (const path of ['/v1/feedback?cursor=bad', '/v1/feedback?cursor=%E0%A4%A', '/v1/feedback?since=abc', '/v1/feedback?status=invalid', '/v1/feedback?target=staging', '/v1/feedback?category=invalid']) {
    assert.equal((await request(path)).status, 400, path);
  }
  const first = await (await request('/v1/feedback?status=new&target=beta&category=bug&since=700&limit=1')).json();
  assert.deepStrictEqual(first.items.map((item) => item.id), [ids[0]]);
  assert.equal(typeof first.nextCursor, 'string');
  const second = await (await request(`/v1/feedback?status=new&target=beta&category=bug&since=700&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
  assert.deepStrictEqual(second.items.map((item) => item.id), [ids[2]]);
  assert.equal(second.nextCursor, null);
  assert.ok(first.items.every((item) => !('uid_hash' in item)), 'list never exposes the salted user hash');
  const detail = await (await request(`/v1/feedback/${ids[0]}`)).json();
  assert.equal('uid_hash' in detail, false);
  assert.equal(detail.id, ids[0]);
});

test('expired admin throttle rows are removed when another key fails', async () => {
  let now = 1950000000000;
  const { env, ctx, db } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret', NOW: () => now } });
  const fail = (ip) => worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback', { headers: { authorization: 'Bearer wrong', 'CF-Connecting-IP': ip } }), env, ctx);
  await fail('198.51.100.1'); await fail('198.51.100.2');
  assert.equal(db.adminAttempts.size, 2);
  now += 11 * 60 * 1000;
  await fail('198.51.100.3');
  assert.equal(db.adminAttempts.size, 1);
});

test('infrastructure failures return controlled errors instead of Worker 500s', async () => {
  const auth = await token();
  const missingDb = harness({ env: { FEEDBACK_DB: undefined } });
  assert.equal((await post(missingDb.env, missingDb.ctx, { auth })).status, 503);

  const brokenDb = new FakeD1();
  brokenDb.prepare = () => { throw new Error('D1 unavailable'); };
  const broken = harness({ db: brokenDb });
  const response = await post(broken.env, broken.ctx, { auth });
  assert.equal(response.status, 500);
  assert.deepStrictEqual(await response.json(), { error: 'Feedback service error' });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://beta.gfcweather.com');
});

test('a failed Discord status update never rejects the background task', async () => {
  const { db, env, ctx, waits } = harness({ env: { FEEDBACK_DISCORD_WEBHOOK_URL: 'https://discord.example/webhook', FETCH: async () => new Response('{}', { status: 200 }) } });
  assert.equal((await post(env, ctx, { auth: await token() })).status, 201);
  const original = db.prepare.bind(db);
  db.prepare = (sql) => (sql.startsWith('UPDATE feedback SET discord_status') ? { bind() { return { run: async () => { throw new Error('D1 write failed'); } }; } } : original(sql));
  await assert.doesNotReject(Promise.all(waits));
});

test('long messages are truncated without losing the Discord trailer ID', async () => {
  const bodies = [];
  const { env, ctx, waits } = harness({ env: { FEEDBACK_DISCORD_WEBHOOK_URL: 'https://discord.example/webhook', FETCH: async (url, init) => { bodies.push(JSON.parse(init.body)); return new Response('{}'); } } });
  const response = await post(env, ctx, { auth: await token(), body: validBody({ message: 'x'.repeat(4000) }) });
  const { id } = await response.json(); await Promise.all(waits);
  const [{ embeds: [{ description }] }] = bodies;
  assert.ok(description.length <= 4096);
  assert.ok(description.endsWith(`**ID:** ${id}`));
});

test('tolerates small clock skew but rejects tokens issued far in the future', async () => {
  const { env, ctx } = harness();
  const nowSeconds = 1950000000;
  assert.equal((await post(env, ctx, { auth: await token({ iat: nowSeconds + 30, auth_time: nowSeconds + 30 }) })).status, 201);
  assert.equal((await post(env, ctx, { auth: await token({ iat: nowSeconds + 300, auth_time: nowSeconds + 300, sub: 'late' }), body: validBody({ message: 'Different message for skew.' }) })).status, 401);
});

test('submission succeeds when no execution context is available', async () => {
  const { env, db } = harness({ env: { FEEDBACK_DISCORD_WEBHOOK_URL: 'https://discord.example/webhook', FETCH: async () => new Response('{}') } });
  const response = await post(env, undefined, { auth: await token() });
  assert.equal(response.status, 201);
  assert.equal(db.rows[0].discord_status, 'sent');
});

test('refetches signing keys once after a key rotation, rate-limited against forged key ids', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const rotated = await crypto.subtle.exportKey('jwk', pair.publicKey);
  rotated.kid = 'rotated-key'; rotated.alg = 'RS256';
  // Start well past any cache left by earlier tests; the first fetch lacks the rotated key, later fetches include it.
  let fetches = 0; let clock = 1950000000000 + 6 * 3600 * 1000;
  const jwksFetch = async () => { fetches += 1; return Response.json({ keys: fetches === 1 ? [jwk] : [jwk, rotated] }, { headers: { 'cache-control': 'max-age=3600' } }); };
  const { env, ctx } = harness({ env: { JWKS_FETCH: jwksFetch, NOW: () => clock } });
  await post(env, ctx, { auth: await token() });
  const before = fetches;
  clock += 120000;
  const ok = await post(env, ctx, { auth: await token({ sub: 'rotated-user' }, pair.privateKey, 'rotated-key'), body: validBody({ message: 'Signed with the rotated key.' }) });
  assert.equal(ok.status, 201);
  assert.equal(fetches, before + 1, 'unknown key id triggers exactly one refetch');

  const forged = harness({ env: { JWKS_FETCH: jwksFetch, NOW: () => clock } });
  const afterRotation = fetches;
  for (let i = 0; i < 5; i += 1) await post(forged.env, forged.ctx, { auth: await token({ sub: `forged-${i}` }, pair.privateKey, `unknown-${i}`) });
  assert.ok(fetches - afterRotation <= 1, 'forged key ids must not trigger a refetch per request');
});

test('a global cap stops floods from many accounts', async () => {
  const { db, env, ctx } = harness();
  const statuses = [];
  for (let i = 0; i < 122; i += 1) {
    statuses.push((await post(env, ctx, { auth: await token({ sub: `flood-user-${i}` }), body: validBody({ message: `Flood message number ${i}.` }) })).status);
  }
  assert.equal(statuses.filter((status) => status === 201).length, 120);
  assert.deepStrictEqual(statuses.slice(120), [429, 429]);
  assert.equal(db.rows.length, 120);
});

test('accepts tokens whose claims contain non-ASCII text', async () => {
  const { env, ctx, db } = harness();
  const response = await post(env, ctx, { auth: await token({ name: 'Zoë Müller ☃', email: 'zoe@example.com' }), body: validBody({ contactOk: true }) });
  assert.equal(response.status, 201);
  assert.equal(db.rows[0].email, 'zoe@example.com');
});

test('rejects pages that are not plain relative router paths', async () => {
  const { db, env, ctx } = harness(); const auth = await token();
  for (const [index, page] of ['javascript:alert(1)', 'https://evil.example/x', '//evil.example', '/a b', '/<script>', 'forecast'].entries()) {
    const response = await post(env, ctx, { auth, body: validBody({ page, message: `Bad page attempt number ${index}.` }) });
    assert.equal(response.status, 400, page);
  }
  assert.equal(db.rows.length, 0);
  assert.equal((await post(env, ctx, { auth, body: validBody({ page: '/forecast/outlooks?x=1#y' }) })).status, 201);
  assert.equal(db.rows[0].page, '/forecast/outlooks');
});

test('only well-formed verified emails are stored, and a throwing payload still marks Discord failed', async () => {
  const { db, env, ctx } = harness();
  assert.equal((await post(env, ctx, { auth: await token({ email: 'bad\nvalue' }), body: validBody({ contactOk: true }) })).status, 201);
  assert.equal(db.rows[0].email, null);

  const failing = harness({ env: { FEEDBACK_DISCORD_WEBHOOK_URL: 'https://discord.example/webhook', FETCH: async () => { throw new Error('network down'); } } });
  assert.equal((await post(failing.env, failing.ctx, { auth: await token({ sub: 'other-user' }) })).status, 201);
  await Promise.all(failing.waits);
  assert.equal(failing.db.rows[0].discord_status, 'failed');
});

test('admin API refuses browser origins and rejects limit=0', async () => {
  const { env, ctx } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret' } });
  const get = (path, headers = {}) => worker.fetch(new Request(`https://feedback.gfcweather.com${path}`, { headers: { authorization: 'Bearer admin-secret', 'CF-Connecting-IP': '192.0.2.9', ...headers } }), env, ctx);
  const browser = await get('/v1/feedback', { origin: 'https://beta.gfcweather.com' });
  assert.equal(browser.status, 403);
  assert.equal(browser.headers.get('access-control-allow-origin'), null);
  assert.equal((await get('/v1/feedback?limit=0')).status, 400);
  assert.equal((await get('/v1/feedback?limit=1')).status, 200);
});

test('header-less admin callers share one fixed bucket so rotating tokens cannot dodge the throttle', async () => {
  const { env, ctx } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret' } });
  const bad = (token) => worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback', { headers: { authorization: `Bearer ${token}` } }), env, ctx);
  for (let i = 0; i < 10; i += 1) assert.equal((await bad(`guess-${i}`)).status, 401);
  assert.equal((await bad('guess-brand-new')).status, 429);
});

test('the guarded insert is one statement carrying every limit guard', async () => {
  const { db, env, ctx } = harness();
  const statements = [];
  const original = db.prepare.bind(db);
  db.prepare = (sql) => { statements.push(sql); return original(sql); };
  await post(env, ctx, { auth: await token() });
  const inserts = statements.filter((sql) => sql.startsWith('INSERT INTO feedback ('));
  assert.equal(inserts.length, 1, 'submission performs exactly one insert statement');
  for (const limit of [LIMITS.recent, LIMITS.daily, LIMITS.global]) assert.ok(inserts[0].includes(`) < ${limit}`), `guard for limit ${limit}`);
  assert.match(inserts[0], /NOT EXISTS/);
});

test('whitespace-only viewport is stored as null and counted after cleaning', async () => {
  const { db, env, ctx } = harness(); const auth = await token();
  assert.equal((await post(env, ctx, { auth, body: validBody({ viewport: '   ' }) })).status, 201);
  assert.equal(db.rows[0].viewport, null);
  assert.equal((await post(env, ctx, { auth, body: validBody({ message: 'Another distinct note here.', viewport: `${' '.repeat(10)}1280x800${' '.repeat(10)}` }) })).status, 201);
  assert.equal(db.rows[1].viewport, '1280x800');
});

test('admin token failures are throttled by salted client IP', async () => {
  const { env, ctx, db } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret' } });
  const attempt = (tokenValue, ip) => worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback', { headers: { authorization: `Bearer ${tokenValue}`, 'CF-Connecting-IP': ip } }), env, ctx);
  for (let i = 0; i < 10; i += 1) assert.equal((await attempt('wrong', '192.0.2.10')).status, 401);
  const blocked = await attempt('wrong', '192.0.2.10');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await attempt('wrong', '192.0.2.11')).status, 401);
  assert.equal((await attempt('admin-secret', '192.0.2.11')).status, 200);
  assert.equal((await attempt('wrong', '192.0.2.10')).status, 429);
  assert.equal(db.adminAttempts.size, 1);
});

test('Access viewer serves a nonce-protected page and has no CORS headers', async () => {
  const accessUrl = `https://${accessDomain}/cdn-cgi/access/certs`;
  const { env, ctx } = harness({ env: {
    CF_ACCESS_TEAM_DOMAIN: accessDomain,
    CF_ACCESS_AUD: accessAud,
    JWKS_FETCH: async (url) => {
      assert.equal(url, accessUrl);
      return Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=300' } });
    },
  } });
  const response = await viewerRequest(env, ctx, '/admin', { auth: await accessToken() });
  const html = await response.text();
  const csp = response.headers.get('content-security-policy');
  assert.ok(csp, 'CSP header must be present');
  const nonce = csp.match(/script-src 'nonce-([^']+)'/)[1];
  assert.equal(response.status, 200);
  assert.match(html, new RegExp(`<style nonce="${nonce}">`));
  assert.match(html, new RegExp(`<script nonce="${nonce}">`));
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.has('access-control-allow-origin'), false);
});

test('Access viewer rejects missing, expired, wrong-audience, wrong-issuer, and invalid signatures', async () => {
  const { env, ctx } = harness({ env: { CF_ACCESS_TEAM_DOMAIN: accessDomain, CF_ACCESS_AUD: accessAud } });
  const badPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const responses = [
    await viewerRequest(env, ctx, '/admin'),
    await viewerRequest(env, ctx, '/admin', { auth: await accessToken({ exp: 1 }) }),
    await viewerRequest(env, ctx, '/admin', { auth: await accessToken({ aud: 'wrong-aud' }) }),
    await viewerRequest(env, ctx, '/admin', { auth: await accessToken({ iss: 'https://wrong.cloudflareaccess.com' }) }),
    await viewerRequest(env, ctx, '/admin', { auth: await accessToken({}, badPair.privateKey) }),
  ];
  assert.deepStrictEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401]);
  assert.ok(responses.every((response) => ![...response.headers.keys()].some((name) => name.startsWith('access-control-'))));
});

test('Access viewer fails closed without config and can restrict allowed emails', async () => {
  const missing = harness();
  assert.equal((await viewerRequest(missing.env, missing.ctx, '/admin')).status, 503);
  const denied = harness({ env: {
    CF_ACCESS_TEAM_DOMAIN: accessDomain,
    CF_ACCESS_AUD: accessAud,
    CF_ACCESS_ALLOWED_EMAILS: 'someone@example.com',
  } });
  const response = await viewerRequest(denied.env, denied.ctx, '/admin', { auth: await accessToken() });
  assert.equal(response.status, 403);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  const odd = await viewerRequest(denied.env, denied.ctx, '/admin', { auth: await accessToken({ email: 12345 }) });
  assert.equal(odd.status, 403, 'a non-string email claim is denied, not a 500');
});

test('expired or exp-less tokens are rejected without fetching signing keys', async () => {
  let fetches = 0;
  const { env, ctx } = harness({ env: { JWKS_FETCH: async () => { fetches += 1; return Response.json({ keys: [jwk] }); } } });
  const expired = await post(env, ctx, { auth: await token({ exp: 1000, sub: 'expired-user' }) });
  const noExp = await post(env, ctx, { auth: await token({ exp: undefined, sub: 'no-exp-user' }) });
  assert.deepStrictEqual([expired.status, noExp.status], [401, 401]);
  assert.equal(fetches, 0, 'no JWKS fetch for tokens that fail the expiry pre-check');
});

test('every viewer response, including auth failures, is marked no-store', async () => {
  const missing = harness();
  assert.equal((await viewerRequest(missing.env, missing.ctx, '/admin')).headers.get('cache-control'), 'no-store');
  const { env, ctx } = harness({ env: { CF_ACCESS_TEAM_DOMAIN: accessDomain, CF_ACCESS_AUD: accessAud } });
  const unauthenticated = await viewerRequest(env, ctx, '/admin');
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get('cache-control'), 'no-store');
});

test('an internal error on a viewer route returns a no-store JSON 500 without CORS', async () => {
  const { db, env, ctx } = harness({ env: { CF_ACCESS_TEAM_DOMAIN: accessDomain, CF_ACCESS_AUD: accessAud } });
  db.prepare = () => { throw new Error('D1 unavailable'); };
  const response = await viewerRequest(env, ctx, '/admin/api/summary', { auth: await accessToken() });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.has('access-control-allow-origin'), false);
});

test('the viewer page is served at /admin and /admin/ alike', async () => {
  const { env, ctx } = harness({ env: { CF_ACCESS_TEAM_DOMAIN: accessDomain, CF_ACCESS_AUD: accessAud } });
  const auth = await accessToken();
  for (const path of ['/admin', '/admin/']) {
    const response = await viewerRequest(env, ctx, path, { auth });
    assert.equal(response.status, 200, path);
    assert.ok((response.headers.get('content-type') ?? '').startsWith('text/html'), path);
  }
});

test('the bearer-token API cannot delete feedback; deletion is viewer-only', async () => {
  const { db, env, ctx } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret' } });
  const id = '00000000-0000-4000-8000-0000000000aa';
  db.rows = [{ id, created_at: 1, uid_hash: 'h', email: null, category: 'bug', message: 'keep me please', page: '/', app_version: '1', build_target: 'beta', plan: null, viewport: null, user_agent: '', status: 'new', discord_status: 'disabled' }];
  const response = await worker.fetch(new Request(`https://feedback.gfcweather.com/v1/feedback/${id}`, { method: 'DELETE', headers: { authorization: 'Bearer admin-secret', 'CF-Connecting-IP': '192.0.2.5' } }), env, ctx);
  assert.equal(response.status, 404);
  assert.equal(db.rows.length, 1);
});

test('Access viewer summary, list, get, patch, delete, 404s, and CSRF checks', async () => {
  const { db, env, ctx } = harness({ env: { CF_ACCESS_TEAM_DOMAIN: accessDomain, CF_ACCESS_AUD: accessAud } });
  const auth = await accessToken();
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  db.rows = ids.map((id, index) => ({
    id, created_at: 2000 - index * 100, uid_hash: 'private-hash', email: index ? null : 'opted-in@example.com',
    category: index ? 'idea' : 'bug', message: `viewer feedback ${index}`, page: '/forecast', app_version: '1.2.3',
    build_target: index ? 'production' : 'beta', plan: null, viewport: null, user_agent: 'test-agent', status: index ? 'triaged' : 'new', discord_status: 'disabled',
  }));
  const summaryResponse = await viewerRequest(env, ctx, '/admin/api/summary', { auth });
  assert.deepStrictEqual(await summaryResponse.json(), {
    total: 2,
    byStatus: { new: 1, triaged: 1, resolved: 0, wontfix: 0 },
    byTarget: { beta: 1, production: 1 },
    byCategory: { bug: 1, idea: 1, praise: 0, question: 0, other: 0 },
  });
  const listResponse = await viewerRequest(env, ctx, '/admin/api/feedback?limit=1', { auth });
  const list = await listResponse.json();
  assert.equal(list.items.length, 1);
  assert.equal(list.nextCursor, '2000:00000000-0000-4000-8000-000000000001');
  assert.equal('uid_hash' in list.items[0], false);
  assert.equal((await (await viewerRequest(env, ctx, `/admin/api/feedback/${ids[0]}`, { auth })).json()).email, 'opted-in@example.com');
  assert.equal((await viewerRequest(env, ctx, '/admin/api/feedback/no-such-id', { auth })).status, 404);
  assert.equal((await viewerRequest(env, ctx, '/admin/api/feedback/%E0%A4%A', { auth })).status, 404);
  const updatePath = `/admin/api/feedback/${ids[0]}`;
  assert.equal((await viewerRequest(env, ctx, updatePath, { method: 'PATCH', auth, body: { status: 'resolved' } })).status, 403);
  assert.equal((await viewerRequest(env, ctx, updatePath, { method: 'PATCH', auth, headers: { origin: 'https://feedback.gfcweather.com' }, body: { status: 'resolved' } })).status, 403);
  const csrfHeaders = { origin: 'https://feedback.gfcweather.com', 'x-gfc-viewer': '1' };
  assert.equal((await viewerRequest(env, ctx, '/admin/api/feedback/missing', { method: 'PATCH', auth, headers: csrfHeaders, body: { status: 'resolved' } })).status, 404);
  assert.equal((await viewerRequest(env, ctx, updatePath, { method: 'PATCH', auth, headers: csrfHeaders, body: { status: 'resolved' } })).status, 200);
  assert.equal(db.rows[0].status, 'resolved');
  const deleted = await viewerRequest(env, ctx, updatePath, { method: 'DELETE', auth, headers: csrfHeaders });
  assert.deepStrictEqual(await deleted.json(), { id: ids[0], deleted: true });
  assert.equal((await viewerRequest(env, ctx, updatePath, { method: 'DELETE', auth, headers: csrfHeaders })).status, 404);
  const unknown = await viewerRequest(env, ctx, '/admin/nope', { auth, headers: { origin: 'https://feedback.gfcweather.com' } });
  assert.equal(unknown.status, 404);
  const responses = [summaryResponse, listResponse, deleted, unknown];
  assert.ok(responses.every((response) => ![...response.headers.keys()].some((name) => name.startsWith('access-control-'))));
});

