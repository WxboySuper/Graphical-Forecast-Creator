import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import worker from './feedback-worker.mjs';

const project = 'gfc-test';
let privateKey;
let jwk;

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(overrides = {}, key = privateKey) {
  const header = b64({ alg: 'RS256', kid: 'test-key' });
  const payload = b64({ iss: `https://securetoken.google.com/${project}`, aud: project, exp: 2000000000, iat: 1900000000, auth_time: 1900000000, sub: 'user-123', email: 'user@example.com', ...overrides });
  const message = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message));
  return `${message}.${Buffer.from(signature).toString('base64url')}`;
}

class FakeD1 {
  rows = [];
  prepare(sql) {
    // The fake statement closes over its owning in-memory database.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() {
        if (sql.startsWith('SELECT SUM')) {
          const [recentSince, dailySince, recentAtSince, dailyAtSince, uid] = args;
          const mine = db.rows.filter((row) => row.uid_hash === uid);
          const recent = mine.filter((row) => row.created_at > recentSince);
          const daily = mine.filter((row) => row.created_at > dailySince);
          return { recent: recent.length, daily: daily.length, recent_at: Math.max(0, ...mine.filter((row) => row.created_at > recentAtSince).map((row) => row.created_at)), daily_at: Math.max(0, ...mine.filter((row) => row.created_at > dailyAtSince).map((row) => row.created_at)) };
        }
        if (sql.includes('AND message = ?')) return db.rows.find((row) => row.uid_hash === args[0] && row.message === args[1] && row.created_at > args[2]) ?? null;
        if (sql.includes('WHERE id = ?')) return db.rows.find((row) => row.id === args[0]) ?? null;
        return null;
      },
      async all() {
        let rows = [...db.rows];
        for (let i = 0; i < args.length - 1; i += 1) {
          if (i === 0 && ['new', 'triaged', 'resolved', 'wontfix'].includes(args[i])) rows = rows.filter((row) => row.status === args[i]);
        }
        rows.sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
        return { results: rows.slice(0, args.at(-1)) };
      },
      async run() {
        if (sql.startsWith('INSERT')) {
          const [id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, user_agent, discord_status] = args;
          db.rows.push({ id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, user_agent, discord_status, status: 'new' });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE feedback SET discord_status')) {
          const row = db.rows.find((item) => item.id === args[1]); if (row) row.discord_status = args[0];
          return { meta: { changes: row ? 1 : 0 } };
        }
        if (sql.startsWith('UPDATE feedback SET status')) {
          const row = db.rows.find((item) => item.id === args[1]); if (row) row.status = args[0];
          return { meta: { changes: row ? 1 : 0 } };
        }
        return { meta: { changes: 0 } };
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
async function post(env, ctx, body = validBody(), auth = null, origin = 'https://beta.gfcweather.com') {
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
  const denied = await post(env, ctx, validBody(), await token(), 'https://evil.example');
  assert.equal(denied.status, 403); assert.equal(denied.headers.has('access-control-allow-origin'), false);
});

test('rejects missing, expired, wrong-audience, and bad-signature Firebase tokens', async () => {
  const { env, ctx } = harness();
  assert.equal((await post(env, ctx)).status, 401);
  assert.equal((await post(env, ctx, validBody(), await token({ exp: 1 }))).status, 401);
  assert.equal((await post(env, ctx, validBody(), await token({ aud: 'wrong' }))).status, 401);
  const wrong = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  assert.equal((await post(env, ctx, validBody(), await token({}, wrong.privateKey))).status, 401);
});

test('validates fields and body size', async () => {
  const { env, ctx } = harness(); const auth = await token();
  assert.equal((await post(env, ctx, validBody({ category: 'unknown' }), auth)).status, 400);
  assert.equal((await post(env, ctx, validBody({ extra: true }), auth)).status, 400);
  assert.equal((await post(env, ctx, validBody({ message: 'short' }), auth)).status, 400);
  const big = new Request('https://feedback.gfcweather.com/v1/feedback', { method: 'POST', headers: { authorization: `Bearer ${auth}`, origin: 'https://beta.gfcweather.com', 'content-type': 'application/json' }, body: 'x'.repeat(17000) });
  assert.equal((await worker.fetch(big, env, ctx)).status, 413);
});

test('hashes uid, strips query and hash, and stores email only with contact consent', async () => {
  const { db, env, ctx } = harness(); const auth = await token();
  assert.equal((await post(env, ctx, validBody(), auth)).status, 201);
  assert.equal(db.rows[0].page, '/forecast'); assert.equal(db.rows[0].email, null);
  assert.notEqual(db.rows[0].uid_hash, 'user-123');
  assert.equal((await post(env, ctx, validBody({ message: 'A distinct helpful note.', contactOk: true }), auth)).status, 201);
  assert.equal(db.rows[1].email, 'user@example.com');
});

test('enforces duplicate and rolling-window rate limits', async () => {
  const { env, ctx } = harness(); const auth = await token();
  assert.equal((await post(env, ctx, validBody(), auth)).status, 201);
  assert.equal((await post(env, ctx, validBody(), auth)).status, 429);
  for (let i = 1; i < 5; i += 1) assert.equal((await post(env, ctx, validBody({ message: `A separate message number ${i}.` }), auth)).status, 201);
  const limited = await post(env, ctx, validBody({ message: 'Yet another separate report.' }), auth);
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);

  let now = 1950000000000;
  const daily = harness({ env: { NOW: () => now } });
  for (let i = 0; i < 20; i += 1) {
    const response = await post(daily.env, daily.ctx, validBody({ message: `A daily report number ${i.toString().padStart(2, '0')}.` }), auth);
    assert.equal(response.status, 201);
    now += 11 * 60 * 1000;
  }
  assert.equal((await post(daily.env, daily.ctx, validBody({ message: 'The daily limit has now been reached.' }), auth)).status, 429);
});

test('Discord success, failure, and disabled states do not change acceptance', async () => {
  for (const [fetcher, expected] of [[async () => new Response('{}', { status: 200 }), 'sent'], [async () => new Response('no', { status: 500 }), 'failed']]) {
    const { db, env, ctx, waits } = harness({ env: { FEEDBACK_DISCORD_WEBHOOK_URL: 'https://discord.example/webhook', FETCH: fetcher } });
    const response = await post(env, ctx, validBody({ message: '@everyone this is a detailed issue report.' }), await token());
    assert.equal(response.status, 201); await Promise.all(waits);
    assert.equal(db.rows[0].discord_status, expected);
  }
  const { db, env, ctx } = harness();
  assert.equal((await post(env, ctx, validBody(), await token())).status, 201);
  assert.equal(db.rows[0].discord_status, 'disabled');
});

test('admin read and patch require the configured token', async () => {
  const { db, env, ctx } = harness({ env: { FEEDBACK_ADMIN_TOKEN: 'admin-secret' } });
  await post(env, ctx, validBody(), await token()); const id = db.rows[0].id;
  const request = (method, path, body) => worker.fetch(new Request(`https://feedback.gfcweather.com${path}`, { method, headers: { authorization: 'Bearer admin-secret', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  assert.equal((await request('GET', `/v1/feedback/${id}`)).status, 200);
  const list = await (await request('GET', '/v1/feedback?limit=1')).json(); assert.equal(list.items.length, 1);
  assert.equal((await request('PATCH', `/v1/feedback/${id}`, { status: 'triaged' })).status, 200);
  assert.equal((await request('PATCH', `/v1/feedback/${id}`, { status: 'other' })).status, 400);
  assert.equal((await worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback', { headers: { authorization: 'Bearer wrong' } }), env, ctx)).status, 401);
  const unavailable = harness();
  assert.equal((await worker.fetch(new Request('https://feedback.gfcweather.com/v1/feedback'), unavailable.env, unavailable.ctx)).status, 503);
});
