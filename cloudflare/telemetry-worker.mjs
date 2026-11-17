import { KeysUnavailableError, verifyToken, digest } from './feedback/auth.mjs';
import { json } from './feedback/response.mjs';
import { handleAdmin } from './telemetry/admin.mjs';
import { validateEvent } from './telemetry/events.mjs';

export { ALLOWED_EVENTS, validateEvent } from './telemetry/events.mjs';

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

export async function fetchTelemetry(request, env) {
  const url = new URL(request.url);
  const now = env.NOW?.() ?? Date.now();
  try {
    if (url.pathname.startsWith('/admin/')) {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { 'cache-control': 'no-store' });
      return await handleAdmin(request, url, env, now);
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
