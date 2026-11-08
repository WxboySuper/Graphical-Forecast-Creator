import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import worker from './feedback-worker.mjs';

const project = 'gfc-test';
let privateKey;
let jwk;

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function isDuplicateRow(row, args) {
  if (row.uid_hash !== args[0]) return false;
  if (row.message !== args[1]) return false;
  return row.created_at > args[2];
}

async function token(overrides = {}, key = privateKey) {
  const header = b64({ alg: 'RS256', kid: 'test-key' });
  const payload = b64({ iss: `https://securetoken.google.com/${project}`, aud: project, exp: 2000000000, iat: 1900000000, auth_time: 1900000000, sub: 'user-123', email: 'user@example.com', ...overrides });
  const message = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message));
  return `${message}.${Buffer.from(signature).toString('base64url')}`;
}

class FakeD1 {
  rows = [];
  adminAttempts = new Map();
  firstHandlers = [
    { matches: (sql) => sql.startsWith('SELECT SUM'), run: (db, args) => {
      const [recentSince, dailySince, recentAtSince, dailyAtSince, uid] = args;
      const mine = db.rows.filter((row) => row.uid_hash === uid);
      const recent = mine.filter((row) => row.created_at > recentSince);
      const daily = mine.filter((row) => row.created_at > dailySince);
      return { recent: recent.length, daily: daily.length, recent_at: Math.max(0, ...mine.filter((row) => row.created_at > recentAtSince).map((row) => row.created_at)), daily_at: Math.max(0, ...mine.filter((row) => row.created_at > dailyAtSince).map((row) => row.created_at)) };
    } },
    { matches: (sql) => sql.includes('AND message = ?'), run: (db, args) => db.rows.find((row) => isDuplicateRow(row, args)) ?? null },
    { matches: (sql) => sql.includes('FROM feedback_admin_attempts'), run: (db, args) => db.adminAttempts.get(args[0]) ?? null },
    { matches: (sql) => sql.includes('FROM feedback WHERE id = ?'), run: (db, args) => db.rows.find((row) => row.id === args[0]) ?? null },
  ];
  runHandlers = [
    { matches: (sql) => sql.startsWith('INSERT INTO feedback_admin_attempts'), run: (db, args) => {
      const [key, now] = args;
      const current = db.adminAttempts.get(key);
      db.adminAttempts.set(key, !current || current.window_started + 600000 <= now ? { window_started: now, attempts: 1 } : { ...current, attempts: current.attempts + 1 });
      return { meta: { changes: 1 } };
    } },
    { matches: (sql) => sql.startsWith('DELETE FROM feedback_admin_attempts'), run: (db, args) => ({ meta: { changes: Number(db.adminAttempts.delete(args[0])) } }) },
    { matches: (sql) => sql.startsWith('INSERT INTO feedback ('), run: (db, args) => {
      const [id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, user_agent, discord_status, ...guards] = args;
      const [, recentSince, , dailySince, , , dupSince] = guards;
      const mine = db.rows.filter((row) => row.uid_hash === uid_hash);
      const blocked = mine.filter((row) => row.created_at > recentSince).length >= 5
        || mine.filter((row) => row.created_at > dailySince).length >= 20
        || mine.some((row) => row.message === message && row.created_at > dupSince);
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
    { matches: (sql) => sql.startsWith('SELECT * FROM feedback'), run: (db, sql, args) => {
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
      rows.sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
      return { results: rows.slice(0, args.at(-1)) };
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
        return firstHandler ? firstHandler.run(db, args) : null;
      },
      async all() {
        return allHandler ? allHandler.run(db, sql, args) : { results: [] };
      },
      async run() {
        return runHandler ? runHandler.run(db, args) : { meta: { changes: 0 } };
      },
    };
    return statement;
  }
}

const validBody = (overrides = {}) => ({ category: 'bug', message: 'This is a detailed report.', page: '/forecast?secret=1#map', appVersion: '1.2.3', buildTarget: 'beta', contactOk: false, ...overrides });
function harness(options = {}) {
  const db = options.db ?? new FakeD1();
  const waits = [];
  const env = { FIREBASE_PROJECT_ID: project, FEEDBACK_HASH_SALT: 'pepper', FEEDBACK_ALLOWED_ORIGINS: 'https://beta.gfcweather.com,http://localhost:3000', FEEDBACK_DB: db, NOW: () => 1950000000000, JWKS_FETCH: async () => Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=300' } }), ...options.env };
  const ctx = { waitUntil(promise) { waits.push(promise); } };
  return { db, env, ctx, waits };
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
  assert.deepEqual(await (await worker.fetch(new Request('https://feedback.gfcweather.com/health'), env, ctx)).json(), { ok: true });
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
  const big = new Request('https://feedback.gfcweather.com/v1/feedback', { method: 'POST', headers: { authorization: `Bearer ${auth}`, origin: 'https://beta.gfcweather.com', 'content-type': 'application/json' }, body: 'x'.repeat(17000) });
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
  assert.deepEqual(same.map((response) => response.status).sort(), [201, 429, 429, 429]);
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
  assert.deepEqual(first.items.map((item) => item.id), [ids[0]]);
  assert.equal(typeof first.nextCursor, 'string');
  const second = await (await request(`/v1/feedback?status=new&target=beta&category=bug&since=700&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
  assert.deepEqual(second.items.map((item) => item.id), [ids[2]]);
  assert.equal(second.nextCursor, null);
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

