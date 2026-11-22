import { applyTrustedClientIp, getTrustedClientIp, WORKER_CLIENT_IP_HEADER, WORKER_SECRET_HEADER } from './site-worker-client-ip.mjs';
import { serviceUnavailable } from './site-worker-response.mjs';

/** Picks the one configured origin and its paired secret; fails closed when none or both are set. */
const selectOrigin = (env) => {
  if (env?.API_ORIGIN && env?.BETA_API_ORIGIN) return { message: 'Set only one of API_ORIGIN and BETA_API_ORIGIN.' };
  if (env?.API_ORIGIN) return { configured: env.API_ORIGIN, workerSecret: env.PRODUCTION_WORKER_SHARED_SECRET };
  if (env?.BETA_API_ORIGIN) return { configured: env.BETA_API_ORIGIN, workerSecret: env.BETA_WORKER_SHARED_SECRET };
  return { message: 'The API origin is not configured.' };
};

/** Parses an origin as a credential-free HTTPS URL with a host; returns a reason when it is not one. */
const parseHttpsOrigin = (configured) => {
  let url;
  try {
    url = new URL(configured);
  } catch {
    return { message: 'The API origin is invalid.' };
  }
  if (!url.hostname) return { message: 'The API origin must include a host.' };
  if (url.protocol !== 'https:') return { message: 'The API origin must be an HTTPS URL.' };
  if (url.username || url.password) return { message: 'The API origin must not include credentials.' };
  return { url };
};

const resolveApiOrigin = (env) => {
  const selected = selectOrigin(env);
  if (selected.message) return { error: serviceUnavailable(selected.message) };
  const parsed = parseHttpsOrigin(selected.configured);
  if (parsed.message) return { error: serviceUnavailable(parsed.message) };
  return { apiOrigin: parsed.url, workerSecret: selected.workerSecret };
};

const buildApiRequest = (request, requestUrl, { apiOrigin, workerSecret }) => {
  apiOrigin.pathname = `${apiOrigin.pathname.replace(/\/$/, '')}${requestUrl.pathname}`;
  apiOrigin.search = requestUrl.search;
  apiOrigin.hash = '';
  const headers = new Headers(request.headers);
  headers.delete(WORKER_CLIENT_IP_HEADER);
  headers.delete(WORKER_SECRET_HEADER);
  applyTrustedClientIp(headers, getTrustedClientIp(request.headers, workerSecret) || request.headers.get('cf-connecting-ip'), workerSecret);
  return new Request(apiOrigin, new Request(request, { headers }));
};

export const proxySiteApi = async (request, requestUrl, env) => {
  const origin = resolveApiOrigin(env);
  if (origin.error) return origin.error;
  let apiResponse;
  try {
    apiResponse = await fetch(buildApiRequest(request, requestUrl, origin), { cf: { cacheTtl: 0 } });
  } catch {
    return Response.json({ error: 'The API is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const responseHeaders = new Headers(apiResponse.headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(apiResponse.body, { status: apiResponse.status, statusText: apiResponse.statusText, headers: responseHeaders });
};
