import { applyTrustedClientIp, WORKER_CLIENT_IP_HEADER, WORKER_SECRET_HEADER } from './site-worker-client-ip.mjs';
import { redirectAlias } from './site-worker-hosts.mjs';
import { serviceUnavailable } from './site-worker-response.mjs';

const API_PREFIX = '/api';

const isApiPath = (pathname) => pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

/** Returns the validated API origin URL, or a fail-closed response when it cannot be used. */
const resolveApiOrigin = (env) => {
  const configuredOrigin = env?.API_ORIGIN || env?.BETA_API_ORIGIN;
  if (!configuredOrigin) return { error: serviceUnavailable('The API origin is not configured.') };
  let apiOrigin;
  try {
    apiOrigin = new URL(configuredOrigin);
  } catch {
    return { error: serviceUnavailable('The API origin is invalid.') };
  }
  if (!apiOrigin.hostname) return { error: serviceUnavailable('The API origin must include a host.') };
  if (apiOrigin.protocol !== 'https:') return { error: serviceUnavailable('The API origin must be an HTTPS URL.') };
  if (apiOrigin.username || apiOrigin.password) {
    return { error: serviceUnavailable('The API origin must not include credentials.') };
  }
  return { apiOrigin };
};

/** Builds the upstream request: path and query forwarded, spoofable headers removed, trusted client IP added. */
const buildApiRequest = (request, requestUrl, env, apiOrigin) => {
  apiOrigin.pathname = `${apiOrigin.pathname.replace(/\/$/, '')}${requestUrl.pathname}`;
  apiOrigin.search = requestUrl.search;
  apiOrigin.hash = '';

  const headers = new Headers(request.headers);
  headers.delete(WORKER_CLIENT_IP_HEADER);
  headers.delete(WORKER_SECRET_HEADER);

  const workerSecret = env.API_ORIGIN
    ? env.PRODUCTION_WORKER_SHARED_SECRET
    : env.BETA_WORKER_SHARED_SECRET;
  applyTrustedClientIp(headers, request.headers.get('cf-connecting-ip'), workerSecret);
  return new Request(apiOrigin, new Request(request, { headers }));
};

/** Proxies one API request to the VPS and marks the response uncacheable. */
const proxyApi = async (request, requestUrl, env) => {
  const { apiOrigin, error } = resolveApiOrigin(env);
  if (error) return error;
  const apiRequest = buildApiRequest(request, requestUrl, env, apiOrigin);
  let apiResponse;
  try {
    apiResponse = await fetch(apiRequest, { cf: { cacheTtl: 0 } });
  } catch {
    return Response.json(
      { error: 'The API is temporarily unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const responseHeaders = new Headers(apiResponse.headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(apiResponse.body, {
    status: apiResponse.status,
    statusText: apiResponse.statusText,
    headers: responseHeaders,
  });
};

/** Serves static assets and proxies API paths to the configured VPS origin. */
export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const aliasResponse = redirectAlias(requestUrl, env);
    if (aliasResponse) return aliasResponse;
    if (isApiPath(requestUrl.pathname)) return proxyApi(request, requestUrl, env);
    if (typeof env?.ASSETS?.fetch !== 'function') {
      return serviceUnavailable('The static assets binding is missing.');
    }
    return env.ASSETS.fetch(request);
  },
};
