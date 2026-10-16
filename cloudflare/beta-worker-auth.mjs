import { normalizeEmail, readBearer, tokenCacheKey } from './beta-worker-utils.mjs';
import { verifyToken } from '@clerk/backend';

const AUTH_PROFILE_CACHE_TTL_MS = 5_000;
const AUTH_PROFILE_CACHE_MAX = 1_000;
const authProfileCache = new Map();

export const clearAuthProfileCache = (clerkId) => {
  if (!clerkId) {
    authProfileCache.clear();
    return;
  }
  for (const key of authProfileCache.keys()) {
    if (key.startsWith(`${clerkId}:`)) authProfileCache.delete(key);
  }
};

function clerkConfigError(message) {
  const error = new Error(message);
  error.code = 'CLERK_CONFIG_MISSING';
  return error;
}

function getAuthorizedParties(env) {
  const configuredParties = env.CLERK_AUTHORIZED_PARTIES || env.PUBLIC_ORIGIN || '';
  const parties = configuredParties.split(',').map((party) => party.trim().replace(/\/+$/, '')).filter(Boolean);
  if (parties.length) return parties;
  throw clerkConfigError('Clerk authorized parties are not configured.');
}

function verifiedSubject(verified) {
  const data = verified?.data || verified;
  if (verified?.errors?.length) {
    console.warn('[beta-worker] Clerk token rejected', verified.errors.map((error) => error.message).join('; '));
  }
  return data?.sub || null;
}

async function verifyClerkIdentity(token, env) {
  const verified = await verifyToken(token, { jwtKey: env.CLERK_JWT_KEY, authorizedParties: getAuthorizedParties(env) });
  const clerkId = verifiedSubject(verified);
  if (!clerkId) return null;
  return { clerkId, cacheKey: await tokenCacheKey(clerkId, token) };
}

function readCachedIdentity(cacheKey) {
  const cached = authProfileCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.identity;
  if (cached) authProfileCache.delete(cacheKey);
  if (authProfileCache.size >= AUTH_PROFILE_CACHE_MAX) {
    const oldestKey = authProfileCache.keys().next().value;
    if (oldestKey) authProfileCache.delete(oldestKey);
  }
  return null;
}

async function requestClerkProfile(clerkId, env) {
  try {
    return await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }, signal: AbortSignal.timeout(3_000),
    });
  } catch (cause) {
    const error = new Error('Clerk profile service is temporarily unavailable.');
    error.code = 'CLERK_PROFILE_UNAVAILABLE';
    error.cause = cause;
    throw error;
  }
}

function isClerkProfileUnavailable(status) {
  return [401, 403, 429].includes(status) || status >= 500;
}

function readVerifiedPrimaryEmail(profile) {
  const addresses = Array.isArray(profile.email_addresses) ? profile.email_addresses : [];
  const primary = addresses.find((entry) => entry?.id === profile.primary_email_address_id);
  const email = normalizeEmail(primary?.email_address);
  if (email && primary?.verification?.status === 'verified') return email;
  console.warn('[beta-worker] Clerk primary email is not verified', Boolean(email), primary?.verification?.status);
  return null;
}

function formatDisplayName(profile) {
  return [profile.first_name, profile.last_name].filter((part) => typeof part === 'string' && part).join(' ');
}

async function fetchClerkProfile(clerkId, env) {
  const response = await requestClerkProfile(clerkId, env);
  if (isClerkProfileUnavailable(response.status)) {
    const error = new Error('Clerk profile service is temporarily unavailable.');
    error.code = 'CLERK_PROFILE_UNAVAILABLE';
    throw error;
  }
  if (!response.ok) {
    console.warn('[beta-worker] Clerk profile response rejected', response.status);
    return null;
  }
  const profile = await response.json();
  const email = readVerifiedPrimaryEmail(profile);
  if (!email) return null;
  return { clerkId, email, displayName: formatDisplayName(profile) };
}

function isTransientClerkAuthError(error) {
  return error?.code === 'CLERK_PROFILE_UNAVAILABLE' || error?.code === 'CLERK_CONFIG_MISSING';
}

async function authenticateVerifiedToken(token, env) {
  const verified = await verifyClerkIdentity(token, env);
  if (!verified) return null;
  const cached = readCachedIdentity(verified.cacheKey);
  if (cached) return cached;
  const identity = await fetchClerkProfile(verified.clerkId, env);
  if (identity) authProfileCache.set(verified.cacheKey, { identity, expiresAt: Date.now() + AUTH_PROFILE_CACHE_TTL_MS });
  return identity;
}

export async function authenticate(request, env) {
  const token = readBearer(request);
  if (!token) return null;
  if (!env.CLERK_JWT_KEY || !env.CLERK_SECRET_KEY) throw clerkConfigError('Clerk verification keys are not configured.');
  try {
    return await authenticateVerifiedToken(token, env);
  } catch (error) {
    if (isTransientClerkAuthError(error)) throw error;
    console.warn('[beta-worker] Clerk token rejected', error instanceof Error ? error.message : 'verification failed');
    return null;
  }
}
