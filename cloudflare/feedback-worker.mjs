const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_BODY_BYTES = 16 * 1024;
const CATEGORIES = new Set(['bug', 'idea', 'praise', 'question', 'other']);
const STATUSES = new Set(['new', 'triaged', 'resolved', 'wontfix']);
let jwksCache = { keys: null, expiresAt: 0 };

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers });
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
const clean = (value) => value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();

async function verifyToken(token, env) {
  try {
    const project = env.FIREBASE_PROJECT_ID;
    if (!project || !token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decode = (part) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const now = Math.floor((env.NOW?.() ?? Date.now()) / 1000);
    if (claims.iss !== `https://securetoken.google.com/${project}` || claims.aud !== project ||
        !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) ||
        claims.iat > now || typeof claims.sub !== 'string' || !claims.sub ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > now) return null;
    if (!jwksCache.keys || jwksCache.expiresAt <= now) {
      const fetcher = env.JWKS_FETCH ?? fetch;
      const response = await fetcher(JWKS_URL);
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data.keys)) return null;
      const cacheControl = response.headers.get('cache-control') ?? '';
      const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] ?? 300);
      jwksCache = { keys: data.keys, expiresAt: now + Math.max(0, Math.min(maxAge, 3600)) };
    }
    const jwk = jwksCache.keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const input = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, input) ? claims : null;
  } catch {
    return null;
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.FEEDBACK_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-max-age': '86400', vary: 'Origin' } : {};
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const fields = new Set(['category', 'message', 'page', 'appVersion', 'buildTarget', 'contactOk', 'viewport', 'plan']);
  if (Object.keys(body).some((key) => !fields.has(key)) || !CATEGORIES.has(body.category) ||
      typeof body.message !== 'string' || body.message.trim().length < 10 || body.message.trim().length > 4000 ||
      typeof body.page !== 'string' || typeof body.appVersion !== 'string' || body.appVersion.length > 40 ||
      !['beta', 'production'].includes(body.buildTarget) || typeof body.contactOk !== 'boolean' ||
      (body.viewport !== undefined && (typeof body.viewport !== 'string' || body.viewport.length > 20)) ||
      (body.plan !== undefined && !['free', 'premium'].includes(body.plan))) return null;
  const page = clean(body.page.split(/[?#]/, 1)[0]);
  if (page.length > 200) return null;
  return { ...body, message: clean(body.message), page, appVersion: clean(body.appVersion), viewport: body.viewport ? clean(body.viewport) : null };
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function postDiscord(env, record) {
  if (!env.FEEDBACK_DISCORD_WEBHOOK_URL) return 'disabled';
  try {
    const tag = record.build_target === 'beta' ? env.FEEDBACK_DISCORD_TAG_BETA : env.FEEDBACK_DISCORD_TAG_PROD;
    const description = `**Feedback:** ${record.message.slice(0, 3800)}\n**Page:** ${record.page}\n**Version:** ${record.app_version}\n**Plan:** ${record.plan ?? 'unknown'}\n**ID:** ${record.id}`.slice(0, 4096);
    const payload = {
      thread_name: `[${record.build_target === 'beta' ? 'BETA' : 'PROD'}] ${record.category}: ${record.message.slice(0, 80)}`.slice(0, 100),
      content: `Feedback ${record.id}`,
      embeds: [{ description }],
      allowed_mentions: { parse: [] },
      ...(tag ? { applied_tags: [tag] } : {}),
    };
    const url = new URL(env.FEEDBACK_DISCORD_WEBHOOK_URL);
    url.searchParams.set('wait', 'true');
    const response = await (env.FETCH ?? fetch)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

async function submit(request, env, ctx, headers) {
  if (request.headers.has('origin') && !headers['access-control-allow-origin']) return json({ error: 'Origin not allowed' }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return json({ error: 'Content-Type must be application/json' }, 400, headers);
  if (!env.FEEDBACK_HASH_SALT) return json({ error: 'Feedback service is not configured' }, 503, headers);
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401, headers);
  const claims = await verifyToken(authorization.slice(7), env);
  if (!claims) return json({ error: 'Invalid authentication token' }, 401, headers);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Request body too large' }, 413, headers);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: 'Request body too large' }, 413, headers);
  let body;
  try { body = validate(JSON.parse(raw)); } catch { body = null; }
  if (!body) return json({ error: 'Invalid feedback payload' }, 400, headers);
  const uidHash = await digest(`${claims.sub}${env.FEEDBACK_HASH_SALT ?? ''}`);
  const now = env.NOW?.() ?? Date.now();
  const counts = await env.FEEDBACK_DB.prepare('SELECT SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS recent, SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS daily, MAX(CASE WHEN created_at > ? THEN created_at END) AS recent_at, MAX(CASE WHEN created_at > ? THEN created_at END) AS daily_at FROM feedback WHERE uid_hash = ?').bind(now - 600000, now - 86400000, now - 600000, now - 86400000, uidHash).first();
  if ((counts?.recent ?? 0) >= 5 || (counts?.daily ?? 0) >= 20) {
    const window = counts.recent >= 5 ? 600000 : 86400000;
    const retry = Math.max(1, Math.ceil((Number(counts.recent >= 5 ? counts.recent_at : counts.daily_at ?? now) + window - now) / 1000));
    return json({ error: 'Rate limit exceeded' }, 429, { ...headers, 'retry-after': String(retry) });
  }
  const duplicate = await env.FEEDBACK_DB.prepare('SELECT id FROM feedback WHERE uid_hash = ? AND message = ? AND created_at > ? LIMIT 1').bind(uidHash, body.message, now - 600000).first();
  if (duplicate) return json({ error: 'Duplicate feedback' }, 429, { ...headers, 'retry-after': '600' });
  const id = crypto.randomUUID();
  const record = { id, created_at: now, uid_hash: uidHash, email: body.contactOk && typeof claims.email === 'string' ? claims.email.slice(0, 320) : null, category: body.category, message: body.message, page: body.page, app_version: body.appVersion, build_target: body.buildTarget, plan: body.plan ?? null, viewport: body.viewport, user_agent: clean((request.headers.get('user-agent') ?? '').slice(0, 500)) };
  await env.FEEDBACK_DB.prepare('INSERT INTO feedback (id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, user_agent, discord_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, now, uidHash, record.email, record.category, record.message, record.page, record.app_version, record.build_target, record.plan, record.viewport, record.user_agent, env.FEEDBACK_DISCORD_WEBHOOK_URL ? 'pending' : 'disabled').run();
  if (env.FEEDBACK_DISCORD_WEBHOOK_URL) ctx.waitUntil((async () => {
    const status = await postDiscord(env, record);
    await env.FEEDBACK_DB.prepare('UPDATE feedback SET discord_status = ? WHERE id = ?').bind(status, id).run();
  })());
  return json({ id }, 201, headers);
}

function adminAuthorized(request, env) {
  const expected = env.FEEDBACK_ADMIN_TOKEN;
  const supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  return Boolean(expected && supplied && constantTimeEqual(supplied, expected));
}

async function admin(request, env, url, id) {
  if (!env.FEEDBACK_ADMIN_TOKEN) return json({ error: 'Admin API unavailable' }, 503);
  if (!adminAuthorized(request, env)) return json({ error: 'Authentication required' }, 401);
  if (id && request.method === 'GET') {
    const item = await env.FEEDBACK_DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(id).first();
    return item ? json(item) : json({ error: 'Feedback not found' }, 404);
  }
  if (id && request.method === 'PATCH') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || Object.keys(body).length !== 1 || !STATUSES.has(body.status)) return json({ error: 'Invalid status' }, 400);
    const result = await env.FEEDBACK_DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(body.status, id).run();
    return result.meta?.changes ? json({ id, status: body.status }) : json({ error: 'Feedback not found' }, 404);
  }
  if (!id && request.method === 'GET') {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
    const cursor = url.searchParams.get('cursor');
    const filters = []; const values = [];
    for (const [param, column] of [['status', 'status'], ['target', 'build_target'], ['category', 'category']]) {
      const value = url.searchParams.get(param);
      if (value) { filters.push(`${column} = ?`); values.push(value); }
    }
    const since = url.searchParams.get('since');
    if (since && /^\d+$/.test(since)) { filters.push('created_at >= ?'); values.push(Number(since)); }
    if (cursor) { filters.push('(created_at, id) < (?, ?)'); const [time, cursorId] = cursor.split(':'); values.push(Number(time), cursorId); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await env.FEEDBACK_DB.prepare(`SELECT * FROM feedback ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...values, limit + 1).all();
    const items = rows.results.slice(0, limit);
    const last = items.at(-1);
    return json({ items, nextCursor: rows.results.length > limit && last ? `${last.created_at}:${last.id}` : null });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true });
    if (url.pathname === '/v1/feedback' && request.method === 'OPTIONS') {
      const headers = corsHeaders(request, env);
      return new Response(null, { status: headers['access-control-allow-origin'] ? 204 : 403, headers });
    }
    if (url.pathname === '/v1/feedback' && request.method === 'POST') return submit(request, env, ctx, corsHeaders(request, env));
    const item = url.pathname.match(/^\/v1\/feedback\/([^/]+)$/);
    if ((url.pathname === '/v1/feedback' && request.method === 'GET') || (item && ['GET', 'PATCH'].includes(request.method))) {
      return admin(request, env, url, item ? decodeURIComponent(item[1]) : null);
    }
    return json({ error: 'Not found' }, 404);
  },
};
