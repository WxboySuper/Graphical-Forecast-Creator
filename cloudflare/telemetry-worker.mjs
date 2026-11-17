import { KeysUnavailableError, verifyToken, digest } from './feedback/auth.mjs';
import { authorizeViewer } from './feedback/access.mjs';
import { json } from './feedback/response.mjs';

export const ALLOWED_EVENTS = Object.freeze([
  'page_view', 'forecast_created', 'forecast_exported', 'forecast_shared', 'forecast_saved_cloud',
  'mesoscale_layer_opened', 'verification_used', 'map_layer_changed', 'premium_feature_used', 'error_shown',
]);

const BODY_LIMIT = 2048;

function today(now) { return new Date(now).toISOString().slice(0, 10); }

export async function dailyHash(secret, day, namespace, value) {
  if (!secret) throw new Error('TELEMETRY_HASH_SECRET is required');
  const salt = await digest(`${secret}:${day}`);
  return digest(`${namespace}:${salt}:${value}`);
}

export async function recordUnique(db, kind, day, hash) {
  const results = await db.batch([
    db.prepare('INSERT OR IGNORE INTO telemetry_dedupe (kind, day, hash) VALUES (?, ?, ?)').bind(kind, day, hash),
    db.prepare('INSERT INTO telemetry_daily_counts (kind, day, count) SELECT ?, ?, 1 WHERE changes() = 1 ON CONFLICT(kind, day) DO UPDATE SET count = count + 1').bind(kind, day),
  ]);
  return (results?.[1]?.meta?.changes ?? 0) > 0;
}

export async function purgeOldDedupe(db, currentDay) {
  await db.prepare('DELETE FROM telemetry_dedupe WHERE day < ?').bind(currentDay).run();
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.TELEMETRY_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function requestError(request, headers) {
  if (request.headers.has('origin') && !headers['access-control-allow-origin']) return json({ error: 'Origin not allowed' }, 403);
  if (!/^application\/json\s*(?:;|$)/i.test((request.headers.get('content-type') ?? '').trim())) return json({ error: 'Content-Type must be application/json' }, 400, headers);
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > BODY_LIMIT) return json({ error: 'Request body too large' }, 413, headers);
  return null;
}

async function parseJson(request, headers) {
  let text = '';
  const reader = request.body?.getReader();
  if (reader) {
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > BODY_LIMIT) {
          await reader.cancel();
          return { response: json({ error: 'Request body too large' }, 413, headers) };
        }
        chunks.push(value);
      }
    } catch { return { response: json({ error: 'Invalid JSON' }, 400, headers) }; }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(joined); }
    catch { return { response: json({ error: 'Invalid JSON' }, 400, headers) }; }
  }
  try {
    const body = JSON.parse(text || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad body');
    return { body };
  } catch { return { response: json({ error: 'Invalid JSON' }, 400, headers) }; }
}

async function takeRateToken(request, env) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !env.TELEMETRY_RATE_LIMITER) return false;
  return (await env.TELEMETRY_RATE_LIMITER.limit({ key: ip })).success;
}

function dailyConfigured(env) {
  return Boolean(env.TELEMETRY_HASH_SECRET && env.TELEMETRY_DB);
}

async function emptyObject(request, env, headers) {
  const parsed = await parseJson(request, headers);
  if (parsed.response) return parsed;
  if (Object.keys(parsed.body).length) return { response: json({ error: 'Invalid payload' }, 400, headers) };
  return parsed;
}

async function countVisit(request, env, headers, now) {
  const err = requestError(request, headers);
  if (err) return err;
  if (request.headers.has('cookie')) return json({ error: 'Cookies are not accepted' }, 400, headers);
  if (!dailyConfigured(env)) return json({ error: 'Telemetry unavailable' }, 503, headers);
  const parsed = await emptyObject(request, env, headers);
  if (parsed.response) return parsed.response;
  if (!(await takeRateToken(request, env))) return json({ error: 'Rate limit exceeded' }, 429, { ...headers, 'retry-after': '60' });
  const ip = request.headers.get('cf-connecting-ip');
  const agent = request.headers.get('user-agent') ?? '';
  const day = today(now);
  const hash = await dailyHash(env.TELEMETRY_HASH_SECRET, day, 'visit', JSON.stringify([ip, agent]));
  await recordUnique(env.TELEMETRY_DB, 'visit', day, hash);
  return new Response(null, { status: 204, headers });
}

async function countActive(request, env, headers, now) {
  const err = requestError(request, headers);
  if (err) return err;
  if (!dailyConfigured(env) || !env.FIREBASE_PROJECT_ID) return json({ error: 'Telemetry unavailable' }, 503, headers);
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401, headers);
  let claims;
  try { claims = await verifyToken(authorization.slice(7), env); }
  catch (error) {
    if (error instanceof KeysUnavailableError) return json({ error: 'Authentication is temporarily unavailable' }, 503, { ...headers, 'retry-after': '30' });
    throw error;
  }
  if (!claims) return json({ error: 'Invalid authentication token' }, 401, headers);
  const parsed = await emptyObject(request, env, headers);
  if (parsed.response) return parsed.response;
  if (!(await takeRateToken(request, env))) return json({ error: 'Rate limit exceeded' }, 429, { ...headers, 'retry-after': '60' });
  const day = today(now);
  const hash = await dailyHash(env.TELEMETRY_HASH_SECRET, day, 'active', claims.sub);
  await recordUnique(env.TELEMETRY_DB, 'active', day, hash);
  return new Response(null, { status: 204, headers });
}

const validDetail = (value) => typeof value === 'string' && value.length <= 80 && /^[A-Za-z0-9 _:./-]*$/.test(value);
const validVersion = (value) => typeof value === 'string' && value.length <= 40 && /^\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/.test(value);

export function validateEvent(body) {
  if (Object.keys(body).some((key) => !['event', 'detail', 'version'].includes(key))) return null;
  if (!ALLOWED_EVENTS.includes(body.event) || !validVersion(body.version)) return null;
  if (body.detail !== undefined && !validDetail(body.detail)) return null;
  return { event: body.event, detail: body.detail ?? '', version: body.version };
}

async function event(request, env, headers) {
  const err = requestError(request, headers);
  if (err) return err;
  if (!env.TELEMETRY_EVENTS) return json({ error: 'Telemetry unavailable' }, 503, headers);
  const parsed = await parseJson(request, headers);
  if (parsed.response) return parsed.response;
  const accepted = validateEvent(parsed.body);
  if (!accepted) return json({ error: 'Invalid event' }, 400, headers);
  if (!(await takeRateToken(request, env))) return json({ error: 'Rate limit exceeded' }, 429, { ...headers, 'retry-after': '60' });
  env.TELEMETRY_EVENTS.writeDataPoint({
    blobs: [accepted.event, accepted.detail, accepted.version, request.cf?.country ?? 'XX'],
    doubles: [1],
  });
  return new Response(null, { status: 204, headers });
}

function sqlQuote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function sqlApi(env, query) {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_API_TOKEN) throw new Error('Analytics API is not configured');
  const fetcher = env.FETCH ?? fetch;
  return fetcher(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`, 'content-type': 'text/plain' },
    body: query,
  });
}

async function analyticsQuery(env, query) {
  const response = await sqlApi(env, query);
  if (!response.ok) throw new Error('Analytics query failed');
  const result = await response.json();
  if (!Array.isArray(result.data)) throw new Error('Invalid analytics response');
  return result.data;
}

const daysParam = (url) => {
  const value = Number(url.searchParams.get('days') ?? 30);
  return Number.isInteger(value) && value >= 1 && value <= 90 ? value : null;
};
const since = (days) => `timestamp >= NOW() - INTERVAL '${days}' DAY`;
const dataset = 'events.analyticsEngine.gfc_telemetry_events';

async function adminRead(path, url, env, now) {
  if (!env.TELEMETRY_DB || !env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_API_TOKEN) return json({ error: 'Telemetry admin API is not configured' }, 503, { 'cache-control': 'no-store' });
  const days = daysParam(url);
  if (!days) return json({ error: 'days must be an integer from 1 to 90' }, 400, { 'cache-control': 'no-store' });
  const from = today(now - (days - 1) * 86_400_000);
  if (path === '/admin/overview') {
    const result = await env.TELEMETRY_DB.prepare('SELECT kind, day, count FROM telemetry_daily_counts WHERE day >= ? ORDER BY day ASC').bind(from).all();
    const daily = result.results ?? [];
    return json({ dailyVisitors: daily.filter((row) => row.kind === 'visit'), dau: daily.filter((row) => row.kind === 'active'), roughMau: daily.filter((row) => row.kind === 'visit' && row.day >= today(now - 29 * 86_400_000)).reduce((sum, row) => sum + row.count, 0), totalAccounts: null, overlapCaveat: 'Rough MAU is the sum of daily unique visitors. The same person can count on several days, so it is not a unique 30-day account or person count.' }, 200, { 'cache-control': 'no-store' });
  }
  let query;
  if (path === '/admin/events') {
    const eventName = url.searchParams.get('event'); const version = url.searchParams.get('version');
    const filters = [since(days)];
    if (eventName) { if (!ALLOWED_EVENTS.includes(eventName)) return json({ error: 'Unknown event' }, 400, { 'cache-control': 'no-store' }); filters.push(`blob1 = ${sqlQuote(eventName)}`); }
    if (version) { if (!validVersion(version)) return json({ error: 'Invalid version' }, 400, { 'cache-control': 'no-store' }); filters.push(`blob3 = ${sqlQuote(version)}`); }
    query = `SELECT blob1 AS event, blob2 AS detail, blob3 AS version, toDate(timestamp) AS day, SUM(double1) AS count FROM ${dataset} WHERE ${filters.join(' AND ')} GROUP BY event, detail, version, day ORDER BY day ASC LIMIT 10000`;
  } else if (path === '/admin/pages') {
    query = `SELECT blob2 AS page, blob3 AS version, toDate(timestamp) AS day, SUM(double1) AS count FROM ${dataset} WHERE ${since(days)} AND blob1 = 'page_view' GROUP BY page, version, day ORDER BY day ASC LIMIT 10000`;
  } else if (path === '/admin/locations') {
    query = `SELECT blob4 AS country, toDate(timestamp) AS day, SUM(double1) AS count FROM ${dataset} WHERE ${since(days)} GROUP BY country, day ORDER BY day ASC LIMIT 10000`;
  } else return json({ error: 'Not found' }, 404, { 'cache-control': 'no-store' });
  const data = await analyticsQuery(env, query);
  return json({ days, data }, 200, { 'cache-control': 'no-store' });
}

async function admin(request, env, url, now) {
  const auth = await authorizeViewer(request, env);
  if (auth.response) return new Response(auth.response.body, { status: auth.response.status, headers: { ...Object.fromEntries(auth.response.headers), 'cache-control': 'no-store' } });
  return adminRead(url.pathname, url, env, now);
}

export async function fetchTelemetry(request, env) {
  const url = new URL(request.url);
  const now = env.NOW?.() ?? Date.now();
  try {
    if (url.pathname.startsWith('/admin/')) {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { 'cache-control': 'no-store' });
      return await admin(request, env, url, now);
    }
    const headers = corsHeaders(request, env);
    const publicPaths = ['/v1/visit', '/v1/active', '/v1/event'];
    if (request.method === 'OPTIONS' && publicPaths.includes(url.pathname)) return new Response(null, { status: headers['access-control-allow-origin'] ? 204 : 403, headers });
    if (request.method !== 'POST' || !publicPaths.includes(url.pathname)) return json({ error: 'Not found' }, 404);
    if (url.pathname === '/v1/visit') return await countVisit(request, env, headers, now);
    if (url.pathname === '/v1/active') return await countActive(request, env, headers, now);
    return await event(request, env, headers);
  } catch {
    const isPublic = url.pathname.startsWith('/v1/');
    const headers = isPublic ? corsHeaders(request, env) : { 'cache-control': 'no-store' };
    return json({ error: 'Telemetry service error' }, 500, headers);
  }
}

export default {
  fetch: fetchTelemetry,
  async scheduled(_controller, env) { await purgeOldDedupe(env.TELEMETRY_DB, today(env.NOW?.() ?? Date.now())); },
};
