import { proxyMarketingApi } from './marketing-worker-api.mjs';
import { isApiPath, isLegacyPath } from './marketing-worker-paths.mjs';
import { parseAppOrigin } from './marketing-worker-origin.mjs';
import { secureMarketingResponse } from './marketing-worker-response.mjs';
import { serviceUnavailable } from './site-worker-response.mjs';

const hasMarketingAssets = (env) => typeof env?.ASSETS?.fetch === 'function';
const hasMarketingHosts = (env) => Boolean(env?.CANONICAL_HOST && env?.WWW_HOST);
const isConfiguredAppOrigin = (origin) => Boolean(origin);

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

const isMarketingHost = (url, env) => [env.CANONICAL_HOST, env.WWW_HOST].some((host) => url.hostname.toLowerCase() === host.toLowerCase());

const legacyRedirect = (url, env, appOrigin) => {
  if (!isLegacyPath(url.pathname)) return null;
  if (!isMarketingHost(url, env)) return null;
  return redirect(url, appOrigin.hostname);
};

const canonicalRedirect = (url, env) => {
  if (url.hostname.toLowerCase() !== env.WWW_HOST.toLowerCase()) return null;
  return redirect(url, env.CANONICAL_HOST);
};

const validateEnvironment = (env) => {
  if (!hasMarketingAssets(env)) return serviceUnavailable('The marketing assets binding is missing.');
  const appOrigin = parseAppOrigin(env?.APP_ORIGIN);
  if (!isConfiguredAppOrigin(appOrigin)) return serviceUnavailable('The marketing Worker host configuration is missing.');
  if (!hasMarketingHosts(env)) return serviceUnavailable('The marketing Worker host configuration is missing.');
  return { appOrigin };
};

export default {
  async fetch(request, env) {
    const configuration = validateEnvironment(env);
    if (configuration instanceof Response) return configuration;
    const url = new URL(request.url);
    const appRedirect = legacyRedirect(url, env, configuration.appOrigin);
    if (appRedirect) return appRedirect;
    const hostRedirect = canonicalRedirect(url, env);
    if (hostRedirect) return hostRedirect;
    if (isApiPath(url.pathname)) return proxyMarketingApi(request, env, configuration.appOrigin);
    return secureMarketingResponse(await env.ASSETS.fetch(request), url);
  },
};
