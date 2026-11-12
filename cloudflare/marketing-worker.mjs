import { applyTrustedClientIp, WORKER_CLIENT_IP_HEADER, WORKER_SECRET_HEADER } from './site-worker-client-ip.mjs';
import { serviceUnavailable } from './site-worker-response.mjs';

const LEGACY_PATHS = ['/forecast', '/discussion', '/monitor', '/verification', '/cloud', '/account', '/admin', '/beta'];
const isLegacyPath = (pathname) => LEGACY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) || pathname === '/beta-access' || pathname.startsWith('/beta-access/');
const isApiPath = (pathname) => pathname === '/api' || pathname.startsWith('/api/');
const isHashedAsset = (pathname) => /[-.][a-z0-9_-]{8,}\.[^/]+$/i.test(pathname);

const parseAppOrigin = (value) => {
  try {
    const origin = new URL(value);
    if (origin.protocol !== 'https:' || !origin.hostname || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    return origin;
  } catch {
    return null;
  }
};

const redirect = (url, hostname) => {
  const target = new URL(url);
  target.protocol = 'https:';
  target.hostname = hostname;
  target.port = '';
  target.username = '';
  target.password = '';
  target.hash = '';
  return Response.redirect(target, 308);
};

const legacyRedirect = (url, env, appOrigin) => {
  const host = url.hostname.toLowerCase();
  if (!isLegacyPath(url.pathname) || ![env.CANONICAL_HOST, env.WWW_HOST].includes(host)) return null;
  return redirect(url, appOrigin.hostname);
};

const proxyApi = async (request, env, appOrigin) => {
  if (typeof env?.APP_WORKER?.fetch !== 'function') return serviceUnavailable('The application Worker binding is missing.');
  if (!env.PRODUCTION_WORKER_SHARED_SECRET) return serviceUnavailable('The application Worker shared secret is missing.');
  const headers = new Headers(request.headers);
  headers.delete(WORKER_CLIENT_IP_HEADER);
  headers.delete(WORKER_SECRET_HEADER);
  applyTrustedClientIp(headers, request.headers.get('cf-connecting-ip'), env.PRODUCTION_WORKER_SHARED_SECRET);
  if (!headers.has(WORKER_CLIENT_IP_HEADER)) return serviceUnavailable('The trusted client IP is unavailable.');
  const target = new URL(request.url);
  target.hostname = appOrigin.hostname;
  target.port = '';
  target.protocol = 'https:';
  try {
    return await env.APP_WORKER.fetch(new Request(target, new Request(request, { headers })));
  } catch {
    return serviceUnavailable('The application Worker is unavailable.');
  }
};

const secureResponse = (response, url) => {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'");
  if (response.status === 404 || response.headers.get('content-type')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/') headers.set('Cache-Control', 'public, max-age=300');
  else if (isHashedAsset(url.pathname)) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export default {
  async fetch(request, env) {
    if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return serviceUnavailable('The marketing assets binding is missing.');
    const appOrigin = parseAppOrigin(env?.APP_ORIGIN);
    if (!appOrigin || !env?.CANONICAL_HOST || !env?.WWW_HOST) return serviceUnavailable('The marketing Worker host configuration is missing.');
    const url = new URL(request.url);
    const appRedirect = legacyRedirect(url, env, appOrigin);
    if (appRedirect) return appRedirect;
    if (url.hostname.toLowerCase() === env.WWW_HOST.toLowerCase()) return redirect(url, env.CANONICAL_HOST);
    if (isApiPath(url.pathname)) return proxyApi(request, env, appOrigin);
    return secureResponse(await env.ASSETS.fetch(request), url);
  },
};
