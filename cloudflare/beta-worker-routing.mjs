import { json } from './beta-worker-utils.mjs';

function validateBetaApiOrigin(value) {
  if (!value) return json({ error: 'The beta API origin is not configured.' }, 503);
  let origin;
  try { origin = new URL(value); } catch { return json({ error: 'The beta API origin is invalid.' }, 503); }
  if (origin.protocol !== 'https:' || origin.username || origin.password) return json({ error: 'The beta API origin must be an HTTPS URL.' }, 503);
  return origin;
}

async function proxyFirebaseApi(request, url, env) {
  const origin = validateBetaApiOrigin(env.BETA_API_ORIGIN);
  if (origin instanceof Response) return origin;
  origin.pathname = `${origin.pathname.replace(/\/$/, '')}${url.pathname}`;
  origin.search = url.search;
  origin.hash = '';
  try {
    const response = await fetch(new Request(origin, request), { cf: { cacheTtl: 0 } });
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch { return json({ error: 'The beta API is temporarily unavailable.' }, 502); }
}

export { proxyFirebaseApi };
