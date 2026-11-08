import { verifyRs256Token } from './auth.mjs';
import { json } from './response.mjs';

const leeway = 60;

function cookieToken(request) {
  const cookie = request.headers.get('cookie') ?? '';
  const item = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('CF_Authorization='));
  return item?.slice('CF_Authorization='.length) ?? '';
}

function accessToken(request) {
  return request.headers.get('cf-access-jwt-assertion') || cookieToken(request);
}

function audienceMatches(aud, expected) {
  if (typeof aud === 'string') return aud === expected;
  return Array.isArray(aud) && aud.includes(expected);
}

function timeClaimsAreValid(claims, now) {
  if (!Number.isFinite(claims.exp) || claims.exp + leeway <= now) return false;
  if (!Number.isFinite(claims.iat) || claims.iat - leeway > now) return false;
  if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf - leeway > now)) return false;
  return true;
}

function identityExists(claims) {
  const email = typeof claims.email === 'string' && claims.email.trim().length > 0;
  const sub = typeof claims.sub === 'string' && claims.sub.trim().length > 0;
  return email || sub;
}

function claimsAreValid(claims, domain, aud, now) {
  if (!claims || typeof claims !== 'object') return false;
  if (claims.iss !== `https://${domain}`) return false;
  if (!audienceMatches(claims.aud, aud)) return false;
  if (!timeClaimsAreValid(claims, now)) return false;
  return identityExists(claims);
}

function allowedEmail(claims, env) {
  const configured = env.CF_ACCESS_ALLOWED_EMAILS;
  if (!configured) return true;
  const allowlist = configured.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes((claims.email ?? '').trim().toLowerCase());
}

export async function authorizeViewer(request, env) {
  const domain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!domain || !aud) return { response: json({ error: 'Viewer unavailable' }, 503) };
  const verified = await verifyRs256Token(accessToken(request), env, `https://${domain}/cdn-cgi/access/certs`);
  if (!verified || !claimsAreValid(verified.claims, domain, aud, verified.now)) {
    return { response: json({ error: 'Authentication required' }, 401) };
  }
  if (!allowedEmail(verified.claims, env)) return { response: json({ error: 'Access denied' }, 403) };
  return { ok: true };
}
