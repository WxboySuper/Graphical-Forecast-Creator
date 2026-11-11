import { serviceUnavailable } from './site-worker-response.mjs';

const isHostname = (value) => {
  if (value.length > 253) return false;
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
export const redirectAlias = (requestUrl, env) => {
  const aliasHost = (env?.WWW_HOST || '').trim().toLowerCase();
  if (!isHostname(aliasHost) || requestUrl.hostname.toLowerCase() !== aliasHost) return null;
  const canonicalHost = (env?.CANONICAL_HOST || '').trim().toLowerCase();
  if (!isHostname(canonicalHost) || canonicalHost === aliasHost) {
    return serviceUnavailable('The canonical host is missing or invalid.');
  }
  const redirectUrl = new URL(requestUrl);
  redirectUrl.hostname = canonicalHost;
  redirectUrl.protocol = 'https:';
  redirectUrl.port = '';
  redirectUrl.username = '';
  redirectUrl.password = '';
  redirectUrl.hash = '';
  return Response.redirect(redirectUrl.toString(), 308);
};

