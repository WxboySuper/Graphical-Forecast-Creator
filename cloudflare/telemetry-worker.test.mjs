import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { ALLOWED_EVENTS, dailyHash, fetchTelemetry, purgeOldDedupe, recordUnique, validateEvent } from './telemetry-worker.mjs';
import { buildEventsQuery, buildLocationsQuery, buildPagesQuery, parseDays, parseEventFilters, readAdminData } from './telemetry/admin.mjs';

class FakeD1 {
  dedupe = new Set();
  counts = new Map();
  prepare(sql) {
    const run = this.run.bind(this);
    const statement = {
      args: [],
      bind(...values) { statement.args = values; return statement; },
      run: async () => run(sql, statement.args),
      all: async () => ({ results: [...this.counts].map(([key, count]) => { const [kind, day] = key.split('|'); return { kind, day, count }; }) }),
    };
    return statement;
  }
  async batch(statements) {
    const [insert, increment] = statements;
    const [kind, day, hash] = insert.args;
    const key = `${kind}|${day}|${hash}`;
    const inserted = !this.dedupe.has(key);
    if (inserted) this.dedupe.add(key);
    if (inserted) {
      const countKey = `${increment.args[0]}|${increment.args[1]}`;
      this.counts.set(countKey, (this.counts.get(countKey) ?? 0) + 1);
    }
    return [{ meta: { changes: inserted ? 1 : 0 } }, { meta: { changes: inserted ? 1 : 0 } }];
  }
  async run(sql, args) {
    if (sql.startsWith('DELETE')) {
      for (const key of this.dedupe) if (key.split('|')[1] < args[0]) this.dedupe.delete(key);
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

const NOW = Date.UTC(2026, 10, 17, 12);
const accessDomain = 'gfc-test.cloudflareaccess.com';
const accessAud = 'telemetry-test-audience';
const signing = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const accessJwk = await crypto.subtle.exportKey('jwk', signing.publicKey);
accessJwk.kid = 'telemetry-test-key';
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function makeAccessToken() {
  const header = base64url({ alg: 'RS256', kid: accessJwk.kid });
  const payload = base64url({ iss: `https://${accessDomain}`, aud: [accessAud], exp: Math.floor(NOW / 1000) + 3600, iat: Math.floor(NOW / 1000), sub: 'admin-test' });
  const message = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signing.privateKey, new TextEncoder().encode(message));
  return `${message}.${Buffer.from(signature).toString('base64url')}`;
}
const baseEnv = () => {
  const rateCounts = new Map();
  return {
    TELEMETRY_HASH_SECRET: 'test-secret',
    TELEMETRY_DB: new FakeD1(),
    TELEMETRY_EVENTS: { points: [], writeDataPoint(point) { this.points.push(point); } },
    TELEMETRY_RATE_LIMITER: { async limit({ key }) { const count = rateCounts.get(key) ?? 0; rateCounts.set(key, count + 1); return { success: count < 60 }; } },
    TELEMETRY_ALLOWED_ORIGINS: 'https://app.gfcweather.com',
    NOW: () => NOW,
  };
};
const post = (path, { env = baseEnv(), body = {}, headers = {}, cf = { country: 'US' } } = {}) => {
  const request = new Request(`https://telemetry.gfcweather.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', 'user-agent': 'test-agent', ...headers }, body: JSON.stringify(body) });
  Object.defineProperty(request, 'cf', { value: cf });
  return fetchTelemetry(request, env);
};

test('daily hash salts rotate by UTC date and separate namespaces', async () => {
  const a = await dailyHash('secret', '2026-11-17', 'visit', 'input');
  assert.notEqual(a, await dailyHash('secret', '2026-11-18', 'visit', 'input'));
  assert.notEqual(a, await dailyHash('secret', '2026-11-17', 'active', 'input'));
  assert.equal(a, await dailyHash('secret', '2026-11-17', 'visit', 'input'));
});

test('dedupe increments a daily count once and purge removes prior-day hashes', async () => {
  const db = new FakeD1();
  assert.equal(await recordUnique(db, 'visit', '2026-11-16', 'hash-a'), true);
  assert.equal(await recordUnique(db, 'visit', '2026-11-16', 'hash-a'), false);
  assert.equal(await recordUnique(db, 'visit', '2026-11-17', 'hash-b'), true);
  assert.equal(db.counts.get('visit|2026-11-16'), 1);
  await purgeOldDedupe(db, '2026-11-17');
  assert.deepEqual([...db.dedupe], ['visit|2026-11-17|hash-b']);
});

test('visit accepts no cookies and returns no content on success', async () => {
  const env = baseEnv();
  const cookie = await post('/v1/visit', { env, headers: { cookie: 'session=secret' } });
  assert.equal(cookie.status, 400);
  const first = await post('/v1/visit', { env });
  const second = await post('/v1/visit', { env });
  assert.equal(first.status, 204);
  assert.equal(second.status, 204);
  assert.equal(env.TELEMETRY_DB.counts.get('visit|2026-11-17'), 1);
});

test('active fails closed without Firebase config and rejects missing tokens', async () => {
  const noConfig = await post('/v1/active', { env: baseEnv() });
  assert.equal(noConfig.status, 503);
  const env = Object.assign(baseEnv(), { FIREBASE_PROJECT_ID: 'gfc-test' });
  const missingToken = await post('/v1/active', { env });
  assert.equal(missingToken.status, 401);
});

test('event allowlist rejects unknown names and fields', () => {
  assert.equal(ALLOWED_EVENTS.includes('page_view'), true);
  assert.deepEqual(validateEvent({ event: 'page_view', detail: '/forecast', version: '2.1.0' }), { event: 'page_view', detail: '/forecast', version: '2.1.0' });
  for (const body of [
    { event: 'unknown', version: '2.1.0' },
    { event: 'page_view', version: '2.1.0', uid: 'private' },
    { event: 'page_view', detail: 'bad?query', version: '2.1.0' },
    { event: 'page_view', detail: 'x'.repeat(81), version: '2.1.0' },
    { event: 'page_view', version: 'latest' },
  ]) assert.equal(validateEvent(body), null);
});

test('event writes only approved blobs and one count, using country or XX', async () => {
  const env = baseEnv();
  const response = await post('/v1/event', { env, body: { event: 'page_view', detail: '/forecast', version: '2.1.0' } });
  assert.equal(response.status, 204);
  assert.deepEqual(env.TELEMETRY_EVENTS.points, [{ blobs: ['page_view', '/forecast', '2.1.0', 'US'], doubles: [1] }]);
  const fallback = await post('/v1/event', { env, body: { event: 'error_shown', version: '2.1' }, cf: {} });
  assert.equal(fallback.status, 204);
  assert.equal(env.TELEMETRY_EVENTS.points[1].blobs[3], 'XX');
});

test('strict CORS, payload caps, and unauthenticated admin paths fail safely', async () => {
  const env = baseEnv();
  const preflight = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/v1/event', { method: 'OPTIONS', headers: { origin: 'https://app.gfcweather.com' } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.gfcweather.com');
  const forbidden = await post('/v1/event', { env, headers: { origin: 'https://evil.example' }, body: { event: 'page_view', version: '2.1.0' } });
  assert.equal(forbidden.status, 403);
  const oversized = await post('/v1/event', { env, body: { event: 'page_view', version: '2.1.0', detail: 'x'.repeat(3000) } });
  assert.equal(oversized.status, 413);
  const adminMissing = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/overview'), env);
  assert.equal(adminMissing.status, 503);
  assert.equal(adminMissing.headers.get('cache-control'), 'no-store');
});

test('admin fails closed when Access configuration is absent', async () => {
  const env = Object.assign(baseEnv(), { CF_ACCOUNT_ID: 'mock-account', CF_ANALYTICS_API_TOKEN: 'mock-token' });
  const response = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/events?days=7'), env);
  assert.equal(response.status, 503);
});

test('per-IP throttling rejects a burst while allowing a separate IP', async () => {
  const env = baseEnv();
  let last;
  for (let index = 0; index < 60; index += 1) last = await post('/v1/event', { env, body: { event: 'error_shown', version: '2.1.0' }, headers: { 'cf-connecting-ip': '192.0.2.50' } });
  assert.equal(last.status, 204);
  const limited = await post('/v1/event', { env, body: { event: 'error_shown', version: '2.1.0' }, headers: { 'cf-connecting-ip': '192.0.2.50' } });
  assert.equal(limited.status, 429);
  const separateIp = await post('/v1/event', { env, body: { event: 'error_shown', version: '2.1.0' }, headers: { 'cf-connecting-ip': '192.0.2.51' } });
  assert.equal(separateIp.status, 204);
});

test('admin verifies Access JWT and queries Analytics Engine with mocked secrets', async () => {
  const env = Object.assign(baseEnv(), {
    CF_ACCESS_TEAM_DOMAIN: accessDomain,
    CF_ACCESS_AUD: accessAud,
    CF_ACCOUNT_ID: 'mock-account-id',
    CF_ANALYTICS_API_TOKEN: 'mock-analytics-token',
    JWKS_FETCH: async () => Response.json({ keys: [accessJwk] }, { headers: { 'cache-control': 'max-age=300' } }),
    FETCH: async (url, options) => {
      assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/mock-account-id/analytics_engine/sql');
      assert.equal(options.headers.authorization, 'Bearer mock-analytics-token');
      assert.match(options.body, /events\.analyticsEngine\.gfc_telemetry_events/);
      assert.match(options.body, /blob1 = 'page_view'/);
      return Response.json({ data: [{ event: 'page_view', detail: '/forecast', version: '2.1.0', day: '2026-11-17', count: 3 }] });
    },
  });
  const token = await makeAccessToken();
  const response = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/events?days=7&event=page_view', { headers: { 'cf-access-jwt-assertion': token } }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, [{ event: 'page_view', detail: '/forecast', version: '2.1.0', day: '2026-11-17', count: 3 }]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('admin query builders validate filters and keep the endpoint queries separated', () => {
  assert.equal(parseDays(new URL('https://telemetry.gfcweather.com/admin/pages?days=14')), 14);
  assert.equal(parseDays(new URL('https://telemetry.gfcweather.com/admin/pages?days=91')), null);
  assert.deepEqual(parseEventFilters(new URL('https://telemetry.gfcweather.com/admin/events?event=page_view&version=2.1.0')), { event: 'page_view', version: '2.1.0' });
  assert.deepEqual(parseEventFilters(new URL('https://telemetry.gfcweather.com/admin/events?event=unknown')), { error: 'Unknown event' });
  assert.match(buildEventsQuery(7, 'page_view', '2.1.0'), /blob1 = 'page_view'.*blob3 = '2\.1\.0'/);
  assert.match(buildPagesQuery(7), /blob1 = 'page_view'/);
  assert.match(buildLocationsQuery(7), /blob4 AS country/);
});

test('admin overview and each analytics route preserve their response shapes', async () => {
  const env = Object.assign(baseEnv(), { CF_ACCOUNT_ID: 'mock-account', CF_ANALYTICS_API_TOKEN: 'mock-token' });
  env.TELEMETRY_DB.counts.set('visit|2026-11-16', 4);
  env.TELEMETRY_DB.counts.set('active|2026-11-16', 2);
  env.FETCH = async (_url, options) => {
    const query = options.body;
    let values;
    if (query.includes('blob4 AS country')) values = [{ country: 'US', day: '2026-11-17', count: 5 }];
    else if (query.includes('blob2 AS page')) values = [{ page: '/forecast', version: '2.1.0', day: '2026-11-17', count: 3 }];
    else values = [{ event: 'page_view', detail: '/forecast', version: '2.1.0', day: '2026-11-17', count: 3 }];
    return Response.json({ data: values });
  };

  const overview = await readAdminData('/admin/overview', new URL('https://telemetry.gfcweather.com/admin/overview?days=7'), env, NOW);
  const summary = await overview.json();
  assert.deepEqual(summary.dailyVisitors, [{ kind: 'visit', day: '2026-11-16', count: 4 }]);
  assert.deepEqual(summary.dau, [{ kind: 'active', day: '2026-11-16', count: 2 }]);
  assert.equal(summary.roughMau, 4);
  assert.equal(summary.totalAccounts, null);
  assert.ok(summary.overlapCaveat);

  const routes = [
    ['/admin/events', 'event'],
    ['/admin/pages', 'page'],
    ['/admin/locations', 'country'],
  ];
  for (const [path, key] of routes) {
    const response = await readAdminData(path, new URL(`https://telemetry.gfcweather.com${path}?days=7`), env, NOW);
    assert.equal(response.status, 200, path);
    const body = await response.json();
    assert.equal(body.days, 7);
    assert.equal(body.data[0][key], key === 'page' ? '/forecast' : key === 'country' ? 'US' : 'page_view');
  }
});

test('scheduled purge retains only the current dedupe day', async () => {
  const env = baseEnv();
  await recordUnique(env.TELEMETRY_DB, 'active', '2026-11-16', 'old');
  await recordUnique(env.TELEMETRY_DB, 'active', '2026-11-17', 'current');
  await worker.scheduled({}, env);
  assert.deepEqual([...env.TELEMETRY_DB.dedupe], ['active|2026-11-17|current']);
});
