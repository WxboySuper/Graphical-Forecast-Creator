import { verifyToken } from './auth.mjs';
import { handleAdmin } from './admin.mjs';
import { notifyDiscord } from './discord.mjs';
import { applyUserRateLimit, createRecord, readLimitedBody } from './store.mjs';
import { json } from './response.mjs';
import { validate } from './validate.mjs';
import { handleViewer } from './viewer.mjs';


function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.FEEDBACK_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
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
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return json({ error: 'Content-Type must be application/json' }, 400, headers);
  return null;
}

async function authenticateSubmission(request, env, headers) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return { response: json({ error: 'Authentication required' }, 401, headers) };
  const claims = await verifyToken(authorization.slice(7), env);
  return claims ? { claims } : { response: json({ error: 'Invalid authentication token' }, 401, headers) };
}

async function parsePayload(request, headers) {
  let raw;
  try { raw = await readLimitedBody(request); } catch { return { response: json({ error: 'Invalid feedback payload' }, 400, headers) }; }
  if (raw.tooLarge) return { response: json({ error: 'Request body too large' }, 413, headers) };
  if (raw.invalid) return { response: json({ error: 'Invalid feedback payload' }, 400, headers) };
  try {
    const body = validate(JSON.parse(raw.text));
    return body ? { body } : { response: json({ error: 'Invalid feedback payload' }, 400, headers) };
  } catch {
    return { response: json({ error: 'Invalid feedback payload' }, 400, headers) };
  }
}

/** Explains an atomic-insert rejection as a duplicate or rate-limit 429. */
async function rejection({ env, uidHash, message, now, headers }) {
  const result = (await applyUserRateLimit(env.FEEDBACK_DB, uidHash, message, now)) ?? { retry: 60, duplicate: false };
  return json({ error: result.duplicate ? 'Duplicate feedback' : 'Rate limit exceeded' }, 429, { ...headers, 'retry-after': String(result.retry) });
}

/** True when every binding and variable the submit path needs is present. */
const isConfigured = (env) => Boolean(env.FEEDBACK_HASH_SALT && env.FEEDBACK_DB && env.FIREBASE_PROJECT_ID);

async function submit(request, env, ctx, headers) {
  const error = requestError(request, headers);
  if (error) return error;
  if (!isConfigured(env)) return json({ error: 'Feedback service is not configured' }, 503, headers);
  const auth = await authenticateSubmission(request, env, headers);
  if (auth.response) return auth.response;
  const parsed = await parsePayload(request, headers);
  if (parsed.response) return parsed.response;
  const now = env.NOW?.() ?? Date.now();
  const { record, inserted, uidHash } = await createRecord(env.FEEDBACK_DB, { env, request, claims: auth.claims, body: parsed.body, now });
  if (!inserted) return rejection({ env, uidHash, message: parsed.body.message, now, headers });
  await notifyDiscord(env, ctx, record);
  return json({ id: record.id }, 201, headers);
}

/** True for the viewer page and everything beneath it; never for look-alikes such as /administrator. */
const isAdminPath = (url) => url.pathname === '/admin' || url.pathname.startsWith('/admin/');

const routeTable = [
  { match: (url) => isAdminPath(url), run: (request, env, url) => handleViewer(request, env, url) },
  { match: (url, method) => url.pathname === '/health' && method === 'GET', run: () => json({ ok: true }) },
  { match: (url, method) => url.pathname === '/v1/feedback' && method === 'OPTIONS', run: (request, env) => {
    const headers = corsHeaders(request, env);
    return new Response(null, { status: headers['access-control-allow-origin'] ? 204 : 403, headers });
  } },
  { match: (url, method) => url.pathname === '/v1/feedback' && method === 'POST', run: (request, env, url, ctx) => submit(request, env, ctx, corsHeaders(request, env)) },
  { match: (url, method) => url.pathname === '/v1/feedback' && method === 'GET', run: (request, env, url) => handleAdmin(request, env, url, null) },
  { match: (url, method) => /^\/v1\/feedback\/[^/]+$/.test(url.pathname) && ['GET', 'PATCH'].includes(method), run: (request, env, url) => {
    try { return handleAdmin(request, env, url, decodeURIComponent(url.pathname.split('/').at(-1))); }
    catch { return json({ error: 'Invalid feedback id' }, 400); }
  } },
];

export async function fetchFeedback(request, env, ctx) {
  const url = new URL(request.url);
  const route = routeTable.find((item) => item.match(url, request.method));
  if (!route) return json({ error: 'Not found' }, 404);
  try {
    return await route.run(request, env, url, ctx);
  } catch {
    // Never log request content; surface a stable error instead of an opaque Worker 500.
    const headers = isAdminPath(url) ? { 'cache-control': 'no-store' } : corsHeaders(request, env);
    return json({ error: 'Feedback service error' }, 500, headers);
  }
}
