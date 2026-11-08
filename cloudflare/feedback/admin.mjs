import { constantTimeEqual, digest } from './auth.mjs';
import { json } from './response.mjs';
import { isCategory, isTarget, validateCursor, validatePageLimit, validateSince } from './validate.mjs';

// Explicit columns: the salted user hash is never exposed; email is present only when the user consented to contact.
const PUBLIC_COLUMNS = 'id, created_at, email, category, message, page, app_version, build_target, plan, viewport, status, discord_status, user_agent';
const ATTEMPT_WINDOW_MS = 600000;
const STATUSES = new Set(['new', 'triaged', 'resolved', 'wontfix']);
const unauthorized = () => json({ error: 'Authentication required' }, 401);
const badQuery = () => json({ error: 'Invalid query parameters' }, 400);

async function attemptKey(request, env) {
  // Cloudflare always sets this header. Without it all callers share one fixed bucket, so rotating tokens can never buy fresh attempts.
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'no-ip';
  return digest(`admin-throttle:${ip}:${env.FEEDBACK_HASH_SALT}`);
}

async function throttleRetry(db, key, now) {
  const attempt = await db.prepare('SELECT window_started, attempts FROM feedback_admin_attempts WHERE key_hash = ?').bind(key).first();
  if (!attempt || attempt.attempts < 10) return null;
  const remaining = attempt.window_started + 600000 - now;
  if (remaining <= 0) return null;
  return Math.max(1, Math.ceil(remaining / 1000));
}

async function recordFailure(db, key, now) {
  // Expired windows from other keys are removed here so attacker-chosen addresses cannot accumulate.
  await db.prepare('DELETE FROM feedback_admin_attempts WHERE window_started <= ?').bind(now - ATTEMPT_WINDOW_MS).run();
  await db.prepare('INSERT INTO feedback_admin_attempts (key_hash, window_started, attempts) VALUES (?, ?, 1) ON CONFLICT(key_hash) DO UPDATE SET window_started = CASE WHEN window_started + 600000 <= excluded.window_started THEN excluded.window_started ELSE window_started END, attempts = CASE WHEN window_started + 600000 <= excluded.window_started THEN 1 ELSE attempts + 1 END').bind(key, now).run();
}

async function authenticate(request, env) {
  const key = await attemptKey(request, env);
  const now = env.NOW?.() ?? Date.now();
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const valid = Boolean(supplied && constantTimeEqual(supplied, env.FEEDBACK_ADMIN_TOKEN));
  if (valid) {
    await env.FEEDBACK_DB.prepare('DELETE FROM feedback_admin_attempts WHERE key_hash = ?').bind(key).run();
    return { ok: true };
  }
  const retry = await throttleRetry(env.FEEDBACK_DB, key, now);
  if (retry) return { response: json({ error: 'Too many failed authentication attempts' }, 429, { 'retry-after': String(retry) }) };
  await recordFailure(env.FEEDBACK_DB, key, now);
  return { response: unauthorized() };
}

function queryValue(url, key) {
  if (url.searchParams.getAll(key).length > 1) return { invalid: true };
  return { value: url.searchParams.get(key) };
}

function decodeCursor(url) {
  const raw = url.search.slice(1).split('&').find((part) => part.startsWith('cursor='));
  if (!raw) return validateCursor(null);
  try {
    return validateCursor(decodeURIComponent(raw.slice(7).replace(/\+/g, ' ')));
  } catch {
    return null;
  }
}

function parseListQuery(url) {
  const limitParam = queryValue(url, 'limit');
  const sinceParam = queryValue(url, 'since');
  const statusParam = queryValue(url, 'status');
  const targetParam = queryValue(url, 'target');
  const categoryParam = queryValue(url, 'category');
  const cursorParam = queryValue(url, 'cursor');
  if ([limitParam, sinceParam, statusParam, targetParam, categoryParam, cursorParam].some((param) => param.invalid)) return null;
  const params = { limit: limitParam.value, since: sinceParam.value, status: statusParam.value, target: targetParam.value, category: categoryParam.value };
  return toListQuery(params, decodeCursor(url));
}

function filtersAreAllowed(params) {
  const checks = [
    () => params.status === null || STATUSES.has(params.status),
    () => params.target === null || isTarget(params.target),
    () => params.category === null || isCategory(params.category),
  ];
  return checks.every((check) => check());
}

function toListQuery(params, cursor) {
  const limit = validatePageLimit(params.limit);
  const since = validateSince(params.since);
  if (limit === null) return null;
  if (since === null) return null;
  if (cursor === null) return null;
  if (!filtersAreAllowed(params)) return null;
  return { limit, since, cursor, status: params.status, target: params.target, category: params.category };
}

function listSql(query) {
  const predicates = [];
  const values = [];
  const filterMap = [
    ['status', query.status, 'status = ?'],
    ['target', query.target, 'build_target = ?'],
    ['category', query.category, 'category = ?'],
  ];
  for (const [, value, predicate] of filterMap) {
    if (value) { predicates.push(predicate); values.push(value); }
  }
  if (query.since !== undefined) { predicates.push('created_at >= ?'); values.push(query.since); }
  if (query.cursor) { predicates.push('(created_at, id) < (?, ?)'); values.push(query.cursor.time, query.cursor.id); }
  const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : '';
  return { sql: `SELECT ${PUBLIC_COLUMNS} FROM feedback ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, values };
}

export async function listFeedback(requestUrl, db) {
  const query = parseListQuery(requestUrl);
  if (!query) return badQuery();
  const statement = listSql(query);
  const result = await db.prepare(statement.sql).bind(...statement.values, query.limit + 1).all();
  const items = result.results.slice(0, query.limit);
  const last = items.at(-1);
  const hasMore = result.results.length > query.limit;
  return json({ items, nextCursor: hasMore && last ? `${last.created_at}:${last.id}` : null });
}

export async function getFeedback(id, db) {
  const item = await db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM feedback WHERE id = ?`).bind(id).first();
  return item ? json(item) : json({ error: 'Feedback not found' }, 404);
}

export async function patchFeedback(request, id, db) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body) return json({ error: 'Invalid status' }, 400);
  if (Object.keys(body).length !== 1) return json({ error: 'Invalid status' }, 400);
  if (!STATUSES.has(body.status)) return json({ error: 'Invalid status' }, 400);
  const result = await db.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(body.status, id).run();
  return result.meta?.changes ? json({ id, status: body.status }) : json({ error: 'Feedback not found' }, 404);
}

export async function deleteFeedback(id, db) {
  const result = await db.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  return result.meta?.changes ? json({ id, deleted: true }) : json({ error: 'Feedback not found' }, 404);
}

const ADMIN_BINDINGS = ['FEEDBACK_ADMIN_TOKEN', 'FEEDBACK_HASH_SALT', 'FEEDBACK_DB'];
const isAdminConfigured = (env) => ADMIN_BINDINGS.every((name) => Boolean(env[name]));

const adminRoutes = [
  { method: 'GET', hasId: false, run: ({ url, env }) => listFeedback(url, env.FEEDBACK_DB) },
  { method: 'GET', hasId: true, run: ({ id, env }) => getFeedback(id, env.FEEDBACK_DB) },
  { method: 'PATCH', hasId: true, run: ({ request, id, env }) => patchFeedback(request, id, env.FEEDBACK_DB) },
  { method: 'DELETE', hasId: true, run: ({ id, env }) => deleteFeedback(id, env.FEEDBACK_DB) },
];

export async function handleAdmin(request, env, url, id) {
  // The admin API is for curl and server-side agents. It sends no CORS headers, and browsers (which always send Origin) are refused outright.
  if (request.headers.has('origin')) return json({ error: 'Admin API is not available from browsers' }, 403);
  if (!isAdminConfigured(env)) return json({ error: 'Admin API unavailable' }, 503);
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  const route = adminRoutes.find((item) => item.method === request.method && item.hasId === Boolean(id));
  return route ? route.run({ request, env, url, id }) : json({ error: 'Not found' }, 404);
}
