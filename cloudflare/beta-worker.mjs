const API_PREFIX = '/api';

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

    const apiRequest = new Request(apiOrigin, request);
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
