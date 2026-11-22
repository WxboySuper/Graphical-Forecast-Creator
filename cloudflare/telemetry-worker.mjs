import { json } from './feedback/response.mjs';
import { handleAdmin } from './telemetry/admin.mjs';
import { handlePublic, publicServiceError } from './telemetry/public.mjs';
import { purgeOldDedupe, utcDay } from './telemetry/daily-counts.mjs';
import { DIGEST_CRON, DigestError, PURGE_CRON, sendDailyDigest } from './telemetry/digest.mjs';

export { ALLOWED_EVENTS, validateEvent } from './telemetry/events.mjs';
export { dailyHash, purgeOldDedupe, recordUnique } from './telemetry/daily-counts.mjs';

function adminResponse(request, url, env, now) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { 'cache-control': 'no-store' });
  return handleAdmin(request, url, env, now);
}

function serviceError(request, url, env) {
  if (url.pathname.startsWith('/v1/')) return publicServiceError(request, env);
  return json({ error: 'Telemetry service error' }, 500, { 'cache-control': 'no-store' });
}

export async function fetchTelemetry(request, env) {
  const url = new URL(request.url);
  const now = env.NOW?.() ?? Date.now();
  try {
    if (url.pathname === '/admin') return Response.redirect(new URL(`/admin/${url.search}`, url).href, 308);
    if (url.pathname.startsWith('/admin/')) return await adminResponse(request, url, env, now);
    return await handlePublic(request, url, env, now);
  } catch (error) {
    // Only the error type is logged: request data and error messages could carry user-supplied values.
    console.error('Telemetry request failed', error?.name ?? 'Error');
    return serviceError(request, url, env);
  }
}

async function runDigest(env, now) {
  // An unset webhook is a quiet no-op even without a database binding.
  if (!env.TELEMETRY_DISCORD_WEBHOOK_URL) return;
  if (!env.TELEMETRY_DB) {
    console.error('Telemetry Discord digest skipped: TELEMETRY_DB binding is not configured');
    return;
  }
  try { await sendDailyDigest(env, now); }
  catch (error) {
    // The digest is best effort. Its own errors carry only an HTTP status; anything else is logged by type so a URL never reaches logs.
    const detail = error instanceof DigestError ? error.message : error?.name ?? 'Error';
    console.error('Telemetry Discord digest failed', detail);
  }
}

async function purge(env, now) {
  if (!env.TELEMETRY_DB) {
    console.error('Telemetry dedupe purge failed: TELEMETRY_DB binding is not configured');
    return;
  }
  try { await purgeOldDedupe(env.TELEMETRY_DB, utcDay(now)); }
  catch (error) {
    console.error('Telemetry dedupe purge failed');
    throw new Error('Telemetry dedupe purge failed', { cause: error });
  }
}

export default {
  fetch: fetchTelemetry,
  async scheduled(controller, env) {
    const now = env.NOW?.() ?? controller?.scheduledTime ?? Date.now();
    const cron = controller?.cron;
    if (cron === DIGEST_CRON) return runDigest(env, now);
    // A missing cron is a direct or test invocation of the original purge job.
    if (cron === PURGE_CRON || cron === undefined) return purge(env, now);
    console.error('Telemetry scheduled run skipped: unknown cron', cron);
  },
};
