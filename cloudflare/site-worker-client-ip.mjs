export const WORKER_CLIENT_IP_HEADER = 'x-gfc-worker-client-ip';
export const WORKER_SECRET_HEADER = 'x-gfc-worker-secret';

const MAX_CLIENT_IP_LENGTH = 45;
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_PATTERN = new RegExp(`^(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}$`);
const IPV6_PATTERN = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/i;

/** Cheap shape check; the API server performs the authoritative net.isIP validation. */
const looksLikeIpAddress = (value) =>
  value.length <= MAX_CLIENT_IP_LENGTH && (IPV4_PATTERN.test(value) || (IPV6_PATTERN.test(value) && /[0-9a-f]/i.test(value) && !value.includes(':::')));

/** Sets trusted client-IP headers only when a shared secret and plausible IP exist. */
export const applyTrustedClientIp = (headers, clientIp, secret) => {
  if (!secret || !clientIp) return;
  if (!looksLikeIpAddress(clientIp.trim())) return;
  headers.set(WORKER_CLIENT_IP_HEADER, clientIp.trim());
  headers.set(WORKER_SECRET_HEADER, secret);
};

