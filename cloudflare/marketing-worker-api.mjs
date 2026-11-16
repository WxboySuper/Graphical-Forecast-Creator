import { applyTrustedClientIp, WORKER_CLIENT_IP_HEADER, WORKER_SECRET_HEADER } from './site-worker-client-ip.mjs';
import { serviceUnavailable } from './site-worker-response.mjs';

const hasAppBinding = (env) => typeof env?.APP_WORKER?.fetch === 'function';

const trustedHeaders = (request, secret) => {
  const headers = new Headers(request.headers);
  headers.delete(WORKER_CLIENT_IP_HEADER);
  headers.delete(WORKER_SECRET_HEADER);
  applyTrustedClientIp(headers, request.headers.get('cf-connecting-ip'), secret);
  return headers;
};

const buildAppRequest = (request, appOrigin, headers) => {
  const target = new URL(request.url);
  target.hostname = appOrigin.hostname;
  target.port = '';
  target.protocol = 'https:';
  target.username = '';
  target.password = '';
  target.hash = '';
  return new Request(target, new Request(request, { headers }));
};

export const proxyMarketingApi = async (request, env, appOrigin) => {
  if (!hasAppBinding(env)) return serviceUnavailable('The application Worker binding is missing.');
  const secret = env.PRODUCTION_WORKER_SHARED_SECRET;
  if (!secret) return serviceUnavailable('The application Worker shared secret is missing.');
  const headers = trustedHeaders(request, secret);
  if (!headers.has(WORKER_CLIENT_IP_HEADER)) return serviceUnavailable('The trusted client IP is unavailable.');
  const appRequest = buildAppRequest(request, appOrigin, headers);
  try {
    return await env.APP_WORKER.fetch(appRequest);
  } catch {
    return serviceUnavailable('The application Worker is unavailable.');
  }
};
