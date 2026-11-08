const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
/** Tolerated clock skew between Google's token issuer and the Worker. */
const CLOCK_LEEWAY_SECONDS = 60;
/** An unknown key id may trigger a JWKS refetch (key rotation), but at most this often. */
const KEY_REFRESH_MIN_SECONDS = 60;
const STALE_RETRY_SECONDS = 30;
/** Thrown when Google's signing keys cannot be loaded at all, so callers can report an outage instead of a bad token. */
export class KeysUnavailableError extends Error {}
const jwksCache = new Map();
/** Test hook: forgets every cached signing key set. */
export const resetKeyCache = () => jwksCache.clear();

/** Decodes unpadded base64url to bytes, restoring the padding atob may require. */
const base64UrlToBytes = (part) => {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** JWT segments are UTF-8 JSON; decode bytes as UTF-8 so non-ASCII claims survive. */
const decodePart = (part) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(part)));

function parseToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return { parts, header: decodePart(parts[0]), claims: decodePart(parts[1]) };
  } catch {
    return null;
  }
}

function claimsAreValid(claims, project, now) {
  const checks = [
    () => claims.iss === `https://securetoken.google.com/${project}`,
    () => claims.aud === project,
    () => Number.isFinite(claims.exp) && claims.exp + CLOCK_LEEWAY_SECONDS > now,
    () => Number.isFinite(claims.iat) && claims.iat - CLOCK_LEEWAY_SECONDS <= now,
    () => typeof claims.sub === 'string' && claims.sub.length > 0,
    () => Number.isFinite(claims.auth_time) && claims.auth_time - CLOCK_LEEWAY_SECONDS <= now,
  ];
  return checks.every((check) => check());
}

function cacheFor(url) {
  if (!jwksCache.has(url)) jwksCache.set(url, { keys: null, expiresAt: 0, fetchedAt: 0 });
  return jwksCache.get(url);
}

function freshKeys(cache, now) {
  if (!cache.keys) return null;
  return cache.expiresAt > now ? cache.keys : null;
}

/** Keeps serving the last-known keys when the key endpoint is briefly unavailable, retrying soon instead of on every request. */
function staleKeys(cache, now) {
  if (!cache.keys) return null;
  cache.expiresAt = now + STALE_RETRY_SECONDS;
  cache.fetchedAt = now;
  return cache.keys;
}

async function fetchJwks(env, url) {
  try {
    const response = await (env.JWKS_FETCH ?? fetch)(url);
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.keys) ? { keys: data.keys, response } : null;
  } catch {
    return null;
  }
}

async function loadKeys(env, now, url, force = false) {
  const cache = cacheFor(url);
  const cached = force ? null : freshKeys(cache, now);
  if (cached) return cached;
  const data = await fetchJwks(env, url);
  if (!data) return staleKeys(cache, now);
  const cacheControl = data.response.headers.get('cache-control') ?? '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] ?? 300);
  cache.keys = data.keys;
  cache.expiresAt = now + Math.max(60, Math.min(maxAge, 3600));
  cache.fetchedAt = now;
  return cache.keys;
}

const hasSigningKey = (keys, kid) => keys.some((key) => key.kid === kid && key.kty === 'RSA');

/** Loads cached keys, refetching once (rate-limited) when the token's key id is unknown after a rotation. */
async function keysFor(env, now, url, kid) {
  const cache = cacheFor(url);
  const keys = await loadKeys(env, now, url);
  if (!keys || hasSigningKey(keys, kid)) return keys;
  if (now - cache.fetchedAt < KEY_REFRESH_MIN_SECONDS) return keys;
  return loadKeys(env, now, url, true);
}

async function verifySignature(parts, header, keys) {
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const input = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBytes(parts[2]);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, input);
}

const validHeader = (header) => typeof header === 'object' && header !== null && header.alg === 'RS256' && typeof header.kid === 'string';
const currentSeconds = (env) => Math.floor((env.NOW?.() ?? Date.now()) / 1000);

/** Parses the token and rejects malformed or already-expired ones before any JWKS fetch, so junk tokens never cost a network call. */
function parseLiveToken(token, now) {
  const parsed = token ? parseToken(token) : null;
  if (!parsed || !validHeader(parsed.header)) return null;
  const exp = parsed.claims?.exp;
  return Number.isFinite(exp) && exp + CLOCK_LEEWAY_SECONDS > now ? parsed : null;
}

async function verifySignatureSafe(token, env, url) {
  const now = currentSeconds(env);
  const parsed = parseLiveToken(token, now);
  if (!parsed) return null;
  const keys = await keysFor(env, now, url, parsed.header.kid);
  if (!keys) throw new KeysUnavailableError('signing keys unavailable');
  if (!(await verifySignature(parsed.parts, parsed.header, keys))) return null;
  return { claims: parsed.claims, now };
}

export async function verifyRs256Token(token, env, url) {
  try { return await verifySignatureSafe(token, env, url); }
  catch (error) {
    if (error instanceof KeysUnavailableError) throw error;
    return null;
  }
}

export async function verifyToken(token, env) {
  const project = env.FIREBASE_PROJECT_ID;
  if (!project) return null;
  try {
    const verified = await verifySignatureSafe(token, env, JWKS_URL);
    return verified && claimsAreValid(verified.claims, project, verified.now) ? verified.claims : null;
  } catch (error) {
    if (error instanceof KeysUnavailableError) throw error;
    return null;
  }
}

export function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
