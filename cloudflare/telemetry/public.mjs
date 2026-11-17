import { json } from '../feedback/response.mjs';
import { countActive, countVisit } from './counts.mjs';
import { countEvent } from './events.mjs';
import { corsHeaders } from './http.mjs';

const PUBLIC_ROUTES = new Map([
  ['/v1/visit', countVisit],
  ['/v1/active', countActive],
  ['/v1/event', countEvent],
]);

export function publicServiceError(request, env) {
  return json({ error: 'Telemetry service error' }, 500, corsHeaders(request, env));
}

export function handlePublic(request, url, env, now) {
  const headers = corsHeaders(request, env);
  const handler = PUBLIC_ROUTES.get(url.pathname);
  if (request.method === 'OPTIONS' && handler) {
    return new Response(null, { status: headers['access-control-allow-origin'] ? 204 : 403, headers });
  }
  if (request.method !== 'POST' || !handler) return json({ error: 'Not found' }, 404, headers);
  return handler(request, env, headers, now);
}
