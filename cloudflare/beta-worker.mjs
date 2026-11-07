const API_PREFIX = '/api';
const WORKER_CLIENT_IP_HEADER = 'x-gfc-worker-client-ip';
const WORKER_SECRET_HEADER = 'x-gfc-worker-secret';

const MAX_CLIENT_IP_LENGTH = 45; // longest IPv6 text form
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/i;

/** Cheap shape check; the API server performs the authoritative net.isIP validation. */
const looksLikeIpAddress = (value) =>
  value.length <= MAX_CLIENT_IP_LENGTH && (IPV4_PATTERN.test(value) || (IPV6_PATTERN.test(value) && /[0-9a-f]/i.test(value) && !value.includes(':::')));

/** Sets the trusted client-IP headers only when a shared secret and a plausible IP exist. */
const applyTrustedClientIp = (headers, clientIp, secret) => {
  if (!secret || !clientIp) return;
  if (!looksLikeIpAddress(clientIp.trim())) return;
  headers.set(WORKER_CLIENT_IP_HEADER, clientIp.trim());
  headers.set(WORKER_SECRET_HEADER, secret);
};

const isApiPath = (pathname) =>
  pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

/** Serves the Vite asset bundle and proxies the existing beta API to its VPS. */
export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);

    if (!isApiPath(requestUrl.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const configuredOrigin = env.BETA_API_ORIGIN;
    if (!configuredOrigin) {
      return Response.json({ error: 'The beta API origin is not configured.' }, { status: 503 });
    }

    let apiOrigin;
    try {
      apiOrigin = new URL(configuredOrigin);
    } catch {
      return Response.json({ error: 'The beta API origin is invalid.' }, { status: 503 });
    }

    if (apiOrigin.protocol !== 'https:') {
      return Response.json({ error: 'The beta API origin must be an HTTPS URL.' }, { status: 503 });
    }
    if (apiOrigin.username) {
      return Response.json({ error: 'The beta API origin must be an HTTPS URL.' }, { status: 503 });
    }
    if (apiOrigin.password) {
      return Response.json({ error: 'The beta API origin must be an HTTPS URL.' }, { status: 503 });
    }

    apiOrigin.pathname = `${apiOrigin.pathname.replace(/\/$/, '')}${requestUrl.pathname}`;
    apiOrigin.search = requestUrl.search;
    apiOrigin.hash = '';

    const headers = new Headers(request.headers);
    // Never let browser-supplied copies cross the proxy boundary.
    headers.delete(WORKER_CLIENT_IP_HEADER);
    headers.delete(WORKER_SECRET_HEADER);

    applyTrustedClientIp(headers, request.headers.get('cf-connecting-ip'), env.BETA_WORKER_SHARED_SECRET);

    const apiRequest = new Request(apiOrigin, new Request(request, { headers }));
    let apiResponse;
    try {
      apiResponse = await fetch(apiRequest, { cf: { cacheTtl: 0 } });
    } catch {
      return Response.json(
        { error: 'The beta API is temporarily unavailable.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const responseHeaders = new Headers(apiResponse.headers);

    // All API routes are dynamic. Prevent browsers and intermediate caches from
    // reusing account, billing, capability, or forecast responses.
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: responseHeaders,
    });
  },
};
