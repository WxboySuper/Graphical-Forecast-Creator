const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { keys: null, expiresAt: 0 };

/** Decodes unpadded base64url to a binary string, restoring the padding atob may require. */
const base64UrlToBinary = (part) => {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
};

const decodePart = (part) => JSON.parse(base64UrlToBinary(part));

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
    () => Number.isFinite(claims.exp) && claims.exp > now,
    () => Number.isFinite(claims.iat) && claims.iat <= now,
    () => typeof claims.sub === 'string' && claims.sub.length > 0,
    () => Number.isFinite(claims.auth_time) && claims.auth_time <= now,
  ];
  return checks.every((check) => check());
}

async function loadKeys(env, now) {
  if (jwksCache.keys && jwksCache.expiresAt > now) return jwksCache.keys;
  const response = await (env.JWKS_FETCH ?? fetch)(JWKS_URL);
  if (!response.ok) return null;
  const data = await response.json();
  if (!Array.isArray(data.keys)) return null;
  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] ?? 300);
  jwksCache = { keys: data.keys, expiresAt: now + Math.max(60, Math.min(maxAge, 3600)) };
  return jwksCache.keys;
}

async function verifySignature(parts, header, keys) {
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const input = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = Uint8Array.from(base64UrlToBinary(parts[2]), (char) => char.charCodeAt(0));
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, input);
}

const validHeader = (header) => header.alg === 'RS256' && typeof header.kid === 'string';
const currentSeconds = (env) => Math.floor((env.NOW?.() ?? Date.now()) / 1000);

async function verifyTokenSafe(token, env) {
  const project = env.FIREBASE_PROJECT_ID;
  if (!project || !token) return null;
  const parsed = parseToken(token);
  if (!parsed) return null;
  if (!validHeader(parsed.header)) return null;
  const now = currentSeconds(env);
  if (!claimsAreValid(parsed.claims, project, now)) return null;
  const keys = await loadKeys(env, now);
  if (!keys) return null;
  if (!(await verifySignature(parsed.parts, parsed.header, keys))) return null;
  return parsed.claims;
}

export async function verifyToken(token, env) {
  try { return await verifyTokenSafe(token, env); }
  catch { return null; }
}

export function constantTimeEqual(left, right) {
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
