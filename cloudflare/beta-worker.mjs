const API_PREFIX = '/api';
const WORKER_CLIENT_IP_HEADER = 'x-gfc-worker-client-ip';
const WORKER_SECRET_HEADER = 'x-gfc-worker-secret';

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

    const clientIp = request.headers.get('cf-connecting-ip');
    if (env.BETA_WORKER_SHARED_SECRET && clientIp && /^[0-9a-f:.]+$/i.test(clientIp)) {
      headers.set(WORKER_CLIENT_IP_HEADER, clientIp);
      headers.set(WORKER_SECRET_HEADER, env.BETA_WORKER_SHARED_SECRET);
    }

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
