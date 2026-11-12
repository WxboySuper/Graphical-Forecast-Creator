import { redirectAlias } from './site-worker-hosts.mjs';
import { serviceUnavailable } from './site-worker-response.mjs';
import { proxySiteApi } from './site-worker-api.mjs';

const API_PREFIX = '/api';

const isApiPath = (pathname) => pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

/** Serves static assets and proxies API paths to the configured VPS origin. */
export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const aliasResponse = redirectAlias(requestUrl, env);
    if (aliasResponse) return aliasResponse;
    if (isApiPath(requestUrl.pathname)) return proxySiteApi(request, requestUrl, env);
    if (typeof env?.ASSETS?.fetch !== 'function') {
      return serviceUnavailable('The static assets binding is missing.');
    }
    return env.ASSETS.fetch(request);
  },
};
