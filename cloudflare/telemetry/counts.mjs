import { KeysUnavailableError, verifyToken } from '../feedback/auth.mjs';
import { json } from '../feedback/response.mjs';
import { dailyHash, recordUnique, utcDay } from './daily-counts.mjs';
import { emptyObject, requestError } from './http.mjs';
import { takeRateToken } from './rate-limit.mjs';

function limited(headers) {
  return json({ error: 'Rate limit exceeded' }, 429, { ...headers, 'retry-after': '60' });
}

async function acceptEmptyPayload(request, headers) {
  const parsed = await emptyObject(request, headers);
  if (parsed.response) return parsed.response;
  return null;
}

function activeCounterConfigured(env) {
  if (!env.TELEMETRY_HASH_SECRET) return false;
  if (!env.TELEMETRY_DB) return false;
  if (!env.FIREBASE_PROJECT_ID) return false;
  return true;
}

export async function countVisit(request, env, headers, now) {
  const err = requestError(request, headers);
  if (err) return err;
  if (request.headers.has('cookie')) return json({ error: 'Cookies are not accepted' }, 400, headers);
  if (!env.TELEMETRY_HASH_SECRET || !env.TELEMETRY_DB) return json({ error: 'Telemetry unavailable' }, 503, headers);
  const payloadError = await acceptEmptyPayload(request, headers);
  if (payloadError) return payloadError;
  if (!(await takeRateToken(request, env))) return limited(headers);
  const day = utcDay(now);
  const visitor = JSON.stringify([request.headers.get('cf-connecting-ip'), request.headers.get('user-agent') ?? '']);
  const hash = await dailyHash(env.TELEMETRY_HASH_SECRET, day, 'visit', visitor);
  await recordUnique(env.TELEMETRY_DB, 'visit', day, hash);
  return new Response(null, { status: 204, headers });
}

async function activeClaims(request, env, headers) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return { response: json({ error: 'Authentication required' }, 401, headers) };
  try {
    const claims = await verifyToken(authorization.slice(7), env);
    if (!claims) return { response: json({ error: 'Invalid authentication token' }, 401, headers) };
    return { claims };
  } catch (error) {
    if (!(error instanceof KeysUnavailableError)) throw error;
    return { response: json({ error: 'Authentication is temporarily unavailable' }, 503, { ...headers, 'retry-after': '30' }) };
  }
}

export async function countActive(request, env, headers, now) {
  const err = requestError(request, headers);
  if (err) return err;
  if (!activeCounterConfigured(env)) return json({ error: 'Telemetry unavailable' }, 503, headers);
  const auth = await activeClaims(request, env, headers);
  if (auth.response) return auth.response;
  const payloadError = await acceptEmptyPayload(request, headers);
  if (payloadError) return payloadError;
  if (!(await takeRateToken(request, env))) return limited(headers);
  const day = utcDay(now);
  const hash = await dailyHash(env.TELEMETRY_HASH_SECRET, day, 'active', auth.claims.sub);
  await recordUnique(env.TELEMETRY_DB, 'active', day, hash);
  return new Response(null, { status: 204, headers });
}
