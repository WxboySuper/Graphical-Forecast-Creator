import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import worker, { ALLOWED_EVENTS, fetchTelemetry, validateEvent } from './telemetry-worker.mjs';
import { dailyHash, purgeOldDedupe, recordUnique } from './telemetry/daily-counts.mjs';
import { buildEventsQuery, buildLocationsQuery, buildPagesQuery, parseDays, parseEventFilters, readAdminData } from './telemetry/admin.mjs';

function insertDedupe(db, args) {
  const [kind, day, hash] = args;
  const key = `${kind}|${day}|${hash}`;
  if (db.dedupe.has(key)) return { meta: { changes: 0 } };
  db.dedupe.add(key);
  // Model the migration trigger as an atomic side effect of this single insert.
  const countKey = `${kind}|${day}`;
  db.counts.set(countKey, (db.counts.get(countKey) ?? 0) + 1);
  return { meta: { changes: 1 } };
}

function deleteOldDedupe(db, currentDay) {
  const before = db.dedupe.size;
  for (const key of db.dedupe) {
    if (key.split('|')[1] < currentDay) db.dedupe.delete(key);
  }
  return { meta: { changes: before - db.dedupe.size } };
}

async function captureErrors(callback) {
  const errors = [];
  const originalError = console.error;
  console.error = (...values) => errors.push(values);
  try { await callback(); }
  finally { console.error = originalError; }
  return errors;
}

class FakeD1 {
  dedupe = new Set();
  counts = new Map();
  executions = [];
  prepare(sql) {
    const statement = {
      args: [],
      bind(...values) { statement.args = values; return statement; },
      run: async () => this.run(sql, statement.args),
      all: async () => ({ results: [...this.counts].map(([key, count]) => { const [kind, day] = key.split('|'); return { kind, day, count }; }).filter((row) => row.day >= statement.args[0]) }),
    };
    return statement;
  }
  async run(sql, args) {
    this.executions.push({ sql, args });
    if (sql.startsWith('INSERT OR IGNORE INTO telemetry_dedupe')) return insertDedupe(this, args);
    if (sql.startsWith('DELETE')) return deleteOldDedupe(this, args[0]);
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
  assert.equal(db.executions.length, 3);
  assert.ok(db.executions.every(({ sql }) => sql.startsWith('INSERT OR IGNORE INTO telemetry_dedupe')));
  const migration = await readFile(new URL('./telemetry/migrations/0001_telemetry.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TRIGGER telemetry_dedupe_counts_after_insert\s+AFTER INSERT ON telemetry_dedupe/i);
  assert.match(migration, /ON CONFLICT\(kind, day\) DO UPDATE SET count = count \+ 1/i);
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

test('visit and active accept the body-less pings the app and marketing site actually send', async () => {
  // Mirrors fetch(url, { method: 'POST' }) from the browser: no Content-Type, no body.
  const bare = (path, env, headers = {}) => fetchTelemetry(new Request(`https://telemetry.gfcweather.com${path}`, { method: 'POST', headers: { origin: 'https://app.gfcweather.com', 'cf-connecting-ip': '192.0.2.9', 'user-agent': 'test-agent', ...headers } }), env);
  const env = baseEnv();
  const visit = await bare('/v1/visit', env);
  assert.equal(visit.status, 204);
  assert.equal(visit.headers.get('access-control-allow-origin'), 'https://app.gfcweather.com');
  assert.equal(env.TELEMETRY_DB.counts.get('visit|2026-11-17'), 1);
  const activeEnv = Object.assign(baseEnv(), { FIREBASE_PROJECT_ID: 'gfc-test' });
  assert.equal((await bare('/v1/active', activeEnv)).status, 401);
  const wrongType = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/v1/visit', { method: 'POST', headers: { origin: 'https://app.gfcweather.com', 'content-type': 'text/plain' }, body: '{}' }), baseEnv());
  assert.equal(wrongType.status, 400);
  const eventNoType = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/v1/event', { method: 'POST', headers: { origin: 'https://app.gfcweather.com' }, body: '{"event":"page_view","version":"2.0.0"}' }), baseEnv());
  assert.equal(eventNoType.status, 400);
});

test('admin logs the Analytics Engine error body when a query fails', async () => {
  const env = Object.assign(baseEnv(), {
    CF_ACCESS_TEAM_DOMAIN: accessDomain,
    CF_ACCESS_AUD: accessAud,
    CF_ACCOUNT_ID: 'mock-account-id',
    CF_ANALYTICS_API_TOKEN: 'mock-analytics-token',
    JWKS_FETCH: async () => Response.json({ keys: [accessJwk] }, { headers: { 'cache-control': 'max-age=300' } }),
    FETCH: async () => new Response('unknown table', { status: 422 }),
  });
  const token = await makeAccessToken();
  let response;
  const errors = await captureErrors(async () => {
    response = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/pages?days=7', { headers: { 'cf-access-jwt-assertion': token } }), env);
  });
  assert.equal(response.status, 500);
  assert.ok(errors.some((values) => values[0] === 'Analytics query failed' && values[1] === 422 && values[2] === 'unknown table'));
  assert.ok(errors.every((values) => !values.join(' ').includes('mock-analytics-token')));
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
    null,
    [],
    'page_view',
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
  const unknown = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/v1/nope', { method: 'POST', headers: { origin: 'https://app.gfcweather.com' } }), env);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get('access-control-allow-origin'), 'https://app.gfcweather.com', 'unknown routes stay readable by allowed origins');
});

test('public request parsing rejects invalid JSON, invalid UTF-8, and other content types', async () => {
  const env = baseEnv();
  const invalidJson = new Request('https://telemetry.gfcweather.com/v1/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  const invalidUtf8 = new Request('https://telemetry.gfcweather.com/v1/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: new Uint8Array([0xff]) });
  const wrongType = new Request('https://telemetry.gfcweather.com/v1/event', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal((await fetchTelemetry(invalidJson, env)).status, 400);
  assert.equal((await fetchTelemetry(invalidUtf8, env)).status, 400);
  assert.equal((await fetchTelemetry(wrongType, env)).status, 400);
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
  const otherRoute = await post('/v1/visit', { env, headers: { 'cf-connecting-ip': '192.0.2.50' } });
  assert.equal(otherRoute.status, 204, 'a burst on one route does not starve the others');
});

test('telemetry stays available when IP or rate limiter is unavailable', async () => {
  const eventBody = { event: 'error_shown', version: '2.1.0' };
  const noBinding = baseEnv();
  delete noBinding.TELEMETRY_RATE_LIMITER;
  assert.equal((await post('/v1/event', { env: noBinding, body: eventBody })).status, 204);

  const noIp = baseEnv();
  assert.equal((await post('/v1/event', { env: noIp, body: eventBody, headers: { 'cf-connecting-ip': '' } })).status, 204);

  const brokenBinding = baseEnv();
  brokenBinding.TELEMETRY_RATE_LIMITER = { async limit() { throw new Error('unavailable'); } };
  assert.equal((await post('/v1/event', { env: brokenBinding, body: eventBody })).status, 204);
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
      assert.match(options.body, /FROM gfc_telemetry_events /);
      assert.doesNotMatch(options.body, /events\.analyticsEngine|toDate\(/);
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
  env.TELEMETRY_DB.counts.set('visit|2026-10-18', 50);
  env.TELEMETRY_DB.counts.set('visit|2026-10-20', 6);
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
  assert.equal(summary.roughMauWindowDays, 7);
  assert.equal(summary.totalAccounts, null);
  assert.match(summary.overlapCaveat, /last 7 UTC days/);

  const ninetyDays = await readAdminData('/admin/overview', new URL('https://telemetry.gfcweather.com/admin/overview?days=90'), env, NOW);
  const ninetyDaySummary = await ninetyDays.json();
  assert.equal(ninetyDaySummary.roughMau, 10);
  assert.equal(ninetyDaySummary.roughMauWindowDays, 30);
  assert.ok(ninetyDaySummary.dailyVisitors.some((row) => row.day === '2026-10-18' && row.count === 50));
  assert.match(ninetyDaySummary.overlapCaveat, /last 30 UTC days/);

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
  env.NOW = () => NOW;
  await recordUnique(env.TELEMETRY_DB, 'active', '2026-11-16', 'old');
  await recordUnique(env.TELEMETRY_DB, 'active', '2026-11-17', 'current');
  await worker.scheduled({}, env);
  assert.deepEqual([...env.TELEMETRY_DB.dedupe], ['active|2026-11-17|current']);
});

test('scheduled purge logs when the database binding is unconfigured', async () => {
  const errors = await captureErrors(() => worker.scheduled({}, {}));
  assert.deepEqual(errors, [['Telemetry dedupe purge failed: TELEMETRY_DB binding is not configured']]);
});

test('scheduled purge reports bound database failures without logging details', async () => {
  const env = baseEnv();
  env.TELEMETRY_DB.prepare = () => ({ bind() { return this; }, async run() { throw new Error('private failure details'); } });
  const errors = await captureErrors(() => assert.rejects(worker.scheduled({}, env), { message: 'Telemetry dedupe purge failed' }));
  assert.deepEqual(errors, [['Telemetry dedupe purge failed']]);
});

test('request failures are logged by error type only and answered with a service error', async () => {
  const env = baseEnv();
  env.TELEMETRY_EVENTS = { writeDataPoint() { throw new TypeError('secret detail 203.0.113.9'); } };
  let response;
  const errors = await captureErrors(async () => { response = await post('/v1/event', { env, body: { event: 'page_view', version: '2.1.0' } }); });
  assert.ok(response.status >= 500);
  assert.deepEqual(errors, [['Telemetry request failed', 'TypeError']]);
});

test('active throttles unauthenticated bursts before verifying any token', async () => {
  const env = Object.assign(baseEnv(), { FIREBASE_PROJECT_ID: 'gfc-test' });
  let last;
  for (let index = 0; index < 61; index += 1) last = await post('/v1/active', { env, headers: { 'cf-connecting-ip': '192.0.2.77' } });
  assert.equal(last.status, 429);
});

test('event and visit requests are throttled before their bodies are read', async () => {
  const env = baseEnv();
  const badEvent = () => post('/v1/event', { env, body: { event: 'nope' }, headers: { 'cf-connecting-ip': '192.0.2.88' } });
  let last;
  for (let index = 0; index < 61; index += 1) last = await badEvent();
  assert.equal(last.status, 429, 'invalid payloads count against the limiter');
});

test('analytics-backed admin routes stay unavailable without analytics credentials', async () => {
  const env = { TELEMETRY_DB: new FakeD1() };
  const response = await readAdminData('/admin/events', new URL('https://telemetry.gfcweather.com/admin/events'), env, Date.UTC(2026, 10, 17));
  assert.equal(response.status, 503);
});

function usageEnv() {
  return Object.assign(baseEnv(), {
    CF_ACCESS_TEAM_DOMAIN: accessDomain,
    CF_ACCESS_AUD: accessAud,
    JWKS_FETCH: async () => Response.json({ keys: [accessJwk] }, { headers: { 'cache-control': 'max-age=300' } }),
  });
}

test('the usage dashboard sits behind Access and /admin redirects to /admin/', async () => {
  const redirect = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin'), usageEnv());
  assert.equal(redirect.status, 308);
  assert.equal(new URL(redirect.headers.get('location')).pathname, '/admin/');
  const withQuery = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin?days=7'), usageEnv());
  assert.equal(new URL(withQuery.headers.get('location')).search, '?days=7', 'the redirect keeps the query string');
  const anonymous = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/'), usageEnv());
  assert.ok([401, 403].includes(anonymous.status), 'the page is not served without an Access token');
  const unconfigured = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/'), baseEnv());
  assert.equal(unconfigured.status, 503, 'the page fails closed without Access configuration');
});

test('the usage dashboard is a self-contained page with a strict content security policy', async () => {
  const token = await makeAccessToken();
  const response = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/', { headers: { 'cf-access-jwt-assertion': token } }), usageEnv());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const csp = response.headers.get('content-security-policy');
  const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
  assert.ok(nonce, 'a per-response script nonce is set');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  const html = await response.text();
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.ok(html.includes('GFC Usage'));
  assert.doesNotMatch(html, /\sstyle=/, 'inline style attributes would be blocked by the policy');
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|@import|innerHTML|insertAdjacentHTML/);
  const other = await fetchTelemetry(new Request('https://telemetry.gfcweather.com/admin/', { headers: { 'cf-access-jwt-assertion': token } }), usageEnv());
  assert.notEqual(/script-src 'nonce-([^']+)'/.exec(other.headers.get('content-security-policy') ?? '')?.[1], nonce, 'nonce changes per response');
});

function digestDb(rows) {
  return {
    prepare(sql) {
      const statement = {
        args: [],
        bind(...values) { statement.args = values; return statement; },
        all: async () => ({ results: rows.filter((row) => row.day <= statement.args[0]) }),
        run: async () => ({ meta: { changes: 0 } }),
      };
      assert.ok(sql.includes('telemetry_daily_counts') || sql.startsWith('DELETE'), sql);
      return statement;
    },
  };
}

function dayRows(kind, counts, endDay) {
  // counts[0] is endDay, counts[1] the day before, and so on.
  return counts.map((count, offset) => ({ kind, day: new Date(Date.parse(`${endDay}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10), count }));
}

function digestEnv(rows, extra = {}) {
  const posts = [];
  const env = {
    TELEMETRY_DB: digestDb(rows),
    TELEMETRY_DISCORD_WEBHOOK_URL: 'https://discord.example/telemetry',
    FETCH: async (url, init) => {
      if (String(url).startsWith('https://discord.example/')) { posts.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
      return extra.analytics ? extra.analytics(url, init) : new Response('no', { status: 500 });
    },
    ...extra.env,
  };
  return { env, posts };
}

// Tuesday 2026-11-17 13:00 UTC digests Monday 2026-11-16.
const DIGEST_TUESDAY = Date.UTC(2026, 10, 17, 13);
const DIGEST_MONDAY = Date.UTC(2026, 10, 16, 13);

test('the 13:00 UTC cron posts a daily digest with a 7-day comparison and a new record', async () => {
  const rows = [...dayRows('visit', [30, 10, 10, 10, 10, 10, 10, 10, 20], '2026-11-16'), ...dayRows('active', [5, 5, 5, 5, 5, 5, 5, 5], '2026-11-16')];
  const { env, posts } = digestEnv(rows, { env: { NOW: () => DIGEST_TUESDAY } });
  await worker.scheduled({ cron: '0 13 * * *' }, env);
  assert.equal(posts.length, 1);
  const [payload] = posts;
  assert.deepStrictEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.content, '🏆 New record: 30 visitors (previous best 20)');
  assert.equal(payload.embeds[0].title, 'GFC daily usage · 2026-11-16 (UTC)');
  const description = payload.embeds[0].description;
  assert.match(description, /\*\*Visitors:\*\* 30 \(\+200% vs 7-day avg 10\)/);
  assert.match(description, /\*\*Active users:\*\* 5 \(\+0% vs 7-day avg 5\)/);
  assert.match(description, /\*\*Last 7 days:\*\* 90 visitors · 35 active users/);
  assert.match(description, /Feature and page breakdown unavailable/);
  assert.doesNotMatch(description, /Week over week/, 'trends are Monday-only');
});

test('a day that only ties the best is not a record, and an unset webhook is a no-op', async () => {
  const rows = dayRows('visit', [20, 20, 5], '2026-11-16');
  const tie = digestEnv(rows, { env: { NOW: () => DIGEST_TUESDAY } });
  await worker.scheduled({ cron: '0 13 * * *' }, tie.env);
  assert.equal(tie.posts[0].content, '');
  const unset = digestEnv(rows, { env: { NOW: () => DIGEST_TUESDAY, TELEMETRY_DISCORD_WEBHOOK_URL: undefined } });
  await worker.scheduled({ cron: '0 13 * * *' }, unset.env);
  assert.equal(unset.posts.length, 0);
});

test('Monday digests add week-over-week trends and feature movers from Analytics Engine', async () => {
  const rows = [...dayRows('visit', [...Array(7).fill(20), ...Array(7).fill(10)], '2026-11-15'), ...dayRows('active', [...Array(7).fill(4), ...Array(7).fill(8)], '2026-11-15')];
  const queries = [];
  const analytics = async (url, init) => {
    queries.push(init.body);
    return Response.json({ data: [
      { event: 'forecast_created', detail: '', day: '2026-11-15', count: 12 },
      { event: 'forecast_exported', detail: 'png', day: '2026-11-15', count: 3 },
      { event: 'page_view', detail: '/forecast', day: '2026-11-15', count: 40 },
      { event: 'page_view', detail: '/', day: '2026-11-15', count: 9 },
      { event: 'forecast_exported', detail: 'png', day: '2026-11-05', count: 10 },
      { event: 'forecast_created', detail: '', day: '2026-11-16', count: 99 },
    ] });
  };
  const { env, posts } = digestEnv(rows, { analytics, env: { NOW: () => DIGEST_MONDAY, CF_ACCOUNT_ID: 'acct', CF_ANALYTICS_API_TOKEN: 'token' } });
  await worker.scheduled({ cron: '0 13 * * *' }, env);
  assert.match(queries[0], /FROM gfc_telemetry_events WHERE timestamp >= NOW\(\) - INTERVAL '15' DAY/);
  const description = posts[0].embeds[0].description;
  assert.match(description, /\*\*Top features:\*\* forecast created 12 · forecast exported 3/, 'today\'s partial day is excluded');
  assert.match(description, /\*\*Top pages:\*\* \/forecast 40 · \/ 9/);
  assert.match(description, /Visitors: 140 vs 70 \(\+100%\)/);
  assert.match(description, /Active users: 28 vs 56 \(-50%\)/);
  assert.match(description, /Biggest movers: forecast created \+12 · forecast exported -7/);
});

test('digest failures are logged without the webhook URL and never break the purge cron', async () => {
  const { env } = digestEnv(dayRows('visit', [1], '2026-11-16'), { env: { NOW: () => DIGEST_TUESDAY, FETCH: async () => new Response('no', { status: 500 }) } });
  const errors = await captureErrors(() => worker.scheduled({ cron: '0 13 * * *' }, env));
  assert.deepStrictEqual(errors, [['Telemetry Discord digest failed', 'Error']]);
  assert.ok(!JSON.stringify(errors).includes('discord.example'));
  const purgeDb = new FakeD1();
  await worker.scheduled({ cron: '0 0 * * *' }, { TELEMETRY_DB: purgeDb, NOW: () => NOW });
  assert.ok(purgeDb.executions.some((item) => item.sql.startsWith('DELETE FROM telemetry_dedupe')));
});
