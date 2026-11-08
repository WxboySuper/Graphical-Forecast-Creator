import { digest } from './auth.mjs';
import { clean } from './validate.mjs';

const WINDOWS = { recent: 600000, daily: 86400000 };
// `global` caps total submissions per recent window so floods from many throwaway accounts cannot fill storage or Discord.
const LIMITS = { recent: 5, daily: 20, global: 120 };

export const MAX_BODY_BYTES = 16 * 1024;

async function cancelReader(reader) {
  try { await reader.cancel(); } catch { /* The size limit still takes precedence. */ }
}

async function readChunks(reader) {
  const chunks = [];
  let size = 0;
  while (size <= MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
  }
  if (size > MAX_BODY_BYTES) {
    await cancelReader(reader);
    return { tooLarge: true };
  }
  return { chunks, size };
}

export async function readLimitedBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { tooLarge: true };
  if (!request.body) return { text: '' };
  const reader = request.body.getReader();
  const result = await readChunks(reader);
  reader.releaseLock();
  if (result.tooLarge) return result;
  const { chunks, size } = result;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { invalid: true };
  }
}

function rateLimitRetry(counts, now) {
  if ((counts?.recent ?? 0) >= LIMITS.recent) return retryAt(counts.recent_at, WINDOWS.recent, now);
  if ((counts?.daily ?? 0) >= LIMITS.daily) return retryAt(counts.daily_at, WINDOWS.daily, now);
  return null;
}

function retryAt(createdAt, window, now) {
  const last = Number(createdAt) || now;
  return Math.max(1, Math.ceil((last + window - now) / 1000));
}

export async function applyUserRateLimit(db, uidHash, message, now) {
  const counts = await db.prepare('SELECT SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS recent, SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS daily, MAX(CASE WHEN created_at > ? THEN created_at END) AS recent_at, MAX(CASE WHEN created_at > ? THEN created_at END) AS daily_at FROM feedback WHERE uid_hash = ?').bind(now - WINDOWS.recent, now - WINDOWS.daily, now - WINDOWS.recent, now - WINDOWS.daily, uidHash).first();
  const retry = rateLimitRetry(counts, now);
  if (retry) return { retry, duplicate: false };
  const duplicate = await db.prepare('SELECT id FROM feedback WHERE uid_hash = ? AND message = ? AND created_at > ? LIMIT 1').bind(uidHash, message, now - WINDOWS.recent).first();
  return duplicate ? { retry: 600, duplicate: true } : null;
}

/**
 * One atomic statement: the row is inserted only while the per-user rolling
 * limits and the duplicate check still hold, so concurrent requests cannot
 * all pass a stale read before inserting.
 */
const GUARDED_INSERT = `INSERT INTO feedback (id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, user_agent, discord_status)
SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
WHERE (SELECT COUNT(*) FROM feedback WHERE uid_hash = ? AND created_at > ?) < ${LIMITS.recent}
AND (SELECT COUNT(*) FROM feedback WHERE uid_hash = ? AND created_at > ?) < ${LIMITS.daily}
AND NOT EXISTS (SELECT 1 FROM feedback WHERE uid_hash = ? AND message = ? AND created_at > ?)
AND (SELECT COUNT(*) FROM feedback WHERE created_at > ?) < ${LIMITS.global}`;

/** Stores an email only with consent and only when the identity provider verified it. */
function contactEmail(body, claims) {
  const usable = body.contactOk && claims.email_verified === true && typeof claims.email === 'string';
  return usable ? claims.email.slice(0, 320) : null;
}

function buildRecord({ env, request, claims, body, now }, uidHash) {
  return {
    id: crypto.randomUUID(), created_at: now, uid_hash: uidHash,
    email: contactEmail(body, claims),
    category: body.category, message: body.message, page: body.page,
    app_version: body.appVersion, build_target: body.buildTarget,
    plan: body.plan ?? null, viewport: body.viewport,
    user_agent: clean((request.headers.get('user-agent') ?? '').slice(0, 500)),
    discord_status: env.FEEDBACK_DISCORD_WEBHOOK_URL ? 'pending' : 'disabled',
  };
}

/** Inserts the feedback row unless a limit or duplicate rule rejects it; resolves { record, inserted }. */
export async function createRecord(db, context) {
  const { env, claims, body, now } = context;
  const uidHash = await digest(`uid:${claims.sub}:${env.FEEDBACK_HASH_SALT}`);
  const r = buildRecord(context, uidHash);
  const values = [r.id, r.created_at, r.uid_hash, r.email, r.category, r.message, r.page, r.app_version, r.build_target, r.plan, r.viewport, r.user_agent, r.discord_status];
  const guards = [uidHash, now - WINDOWS.recent, uidHash, now - WINDOWS.daily, uidHash, body.message, now - WINDOWS.recent, now - WINDOWS.recent];
  const result = await db.prepare(GUARDED_INSERT).bind(...values, ...guards).run();
  return { record: r, inserted: (result?.meta?.changes ?? 0) > 0, uidHash };
}
