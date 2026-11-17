import { json } from '../feedback/response.mjs';
import { parseJson, requestError } from './http.mjs';
import { takeRateToken } from './rate-limit.mjs';

export const ALLOWED_EVENTS = Object.freeze([
  'page_view', 'forecast_created', 'forecast_exported', 'forecast_shared', 'forecast_saved_cloud',
  'mesoscale_layer_opened', 'verification_used', 'map_layer_changed', 'premium_feature_used', 'error_shown',
]);

export const validDetail = (value) => typeof value === 'string' && value.length <= 80 && /^[A-Za-z0-9 _:./-]*$/.test(value);
export const validVersion = (value) => typeof value === 'string' && value.length <= 40 && /^\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/.test(value);

export function validateEvent(body) {
  if (Object.keys(body).some((key) => !['event', 'detail', 'version'].includes(key))) return null;
  if (!ALLOWED_EVENTS.includes(body.event) || !validVersion(body.version)) return null;
  if (body.detail !== undefined && !validDetail(body.detail)) return null;
  return { event: body.event, detail: body.detail ?? '', version: body.version };
}

export async function countEvent(request, env, headers) {
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
