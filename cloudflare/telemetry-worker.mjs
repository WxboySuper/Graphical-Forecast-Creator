import { json } from './feedback/response.mjs';
import { handleAdmin } from './telemetry/admin.mjs';
import { handlePublic, publicServiceError } from './telemetry/public.mjs';
import { purgeOldDedupe, utcDay } from './telemetry/daily-counts.mjs';

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

export default {
  fetch: fetchTelemetry,
  async scheduled(_controller, env) {
    if (!env.TELEMETRY_DB) {
      console.error('Telemetry dedupe purge failed: TELEMETRY_DB binding is not configured');
      return;
    }
    try { await purgeOldDedupe(env.TELEMETRY_DB, utcDay(env.NOW?.() ?? Date.now())); }
    catch (error) {
      console.error('Telemetry dedupe purge failed');
      throw new Error('Telemetry dedupe purge failed', { cause: error });
    }
  },
};
