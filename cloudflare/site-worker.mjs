const API_PREFIX = '/api';
const WORKER_CLIENT_IP_HEADER = 'x-gfc-worker-client-ip';
const WORKER_SECRET_HEADER = 'x-gfc-worker-secret';

const MAX_CLIENT_IP_LENGTH = 45;
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_PATTERN = new RegExp(`^(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}$`);
const IPV6_PATTERN = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/i;

/** Cheap shape check; the API server performs the authoritative net.isIP validation. */
const looksLikeIpAddress = (value) =>
  value.length <= MAX_CLIENT_IP_LENGTH && (IPV4_PATTERN.test(value) || (IPV6_PATTERN.test(value) && /[0-9a-f]/i.test(value) && !value.includes(':::')));

/** Sets trusted client-IP headers only when a shared secret and plausible IP exist. */
const applyTrustedClientIp = (headers, clientIp, secret) => {
  if (!secret || !clientIp) return;
  if (!looksLikeIpAddress(clientIp.trim())) return;
  headers.set(WORKER_CLIENT_IP_HEADER, clientIp.trim());
  headers.set(WORKER_SECRET_HEADER, secret);
};

const isApiPath = (pathname) => pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

const serviceUnavailable = (error) =>
  Response.json({ error }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

const isHostname = (value) => {
  if (!/^[a-z0-9.-]+$/i.test(value)) return false;
  if (value.startsWith('.')) return false;
  if (value.endsWith('.')) return false;
  if (value.includes('..')) return false;

  const labels = value.split('.');
  return labels.every((label) => {
    if (label.length === 0) return false;
    if (label.length > 63) return false;
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) return false;
    return true;
  });
};

/** Redirects the configured alias to the canonical host without dropping path or query. */
const redirectAlias = (requestUrl, env) => {
  const aliasHost = (env.WWW_HOST || '').trim().toLowerCase();
  if (!isHostname(aliasHost) || requestUrl.hostname.toLowerCase() !== aliasHost) return null;
  const canonicalHost = (env.CANONICAL_HOST || '').trim().toLowerCase();
  if (!isHostname(canonicalHost) || canonicalHost === aliasHost) {
    return serviceUnavailable('The canonical host is missing or invalid.');
  }
  const redirectUrl = new URL(requestUrl);
  redirectUrl.hostname = canonicalHost;
  redirectUrl.protocol = 'https:';
  return Response.redirect(redirectUrl.toString(), 308);
};

/** Serves static assets and proxies API paths to the configured VPS origin. */
export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const aliasResponse = redirectAlias(requestUrl, env);
    if (aliasResponse) return aliasResponse;

    if (!isApiPath(requestUrl.pathname)) return env.ASSETS.fetch(request);

    const configuredOrigin = env.API_ORIGIN || env.BETA_API_ORIGIN;
    if (!configuredOrigin) {
      return serviceUnavailable('The API origin is not configured.');
    }

    let apiOrigin;
    try {
      apiOrigin = new URL(configuredOrigin);
    } catch {
      return serviceUnavailable('The API origin is invalid.');
    }

    if (apiOrigin.protocol !== 'https:') {
      return serviceUnavailable('The API origin must be an HTTPS URL.');
    }
    if (apiOrigin.username) {
      return serviceUnavailable('The API origin must not include credentials.');
    }
    if (apiOrigin.password) {
      return serviceUnavailable('The API origin must not include credentials.');
    }

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

    const apiRequest = new Request(apiOrigin, new Request(request, { headers }));
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
  },
};
