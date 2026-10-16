import { createUserEnsurer, emailSnapshotKey } from './beta-user-migration.mjs';
import { decodePathId, isObject, json, mapStripeInterval, normalizeEmail, parseJson, readBearer, readLimitedBody, timingSafeStringEqual, tokenCacheKey, verifyStripeSignature } from './beta-worker-utils.mjs';
import { parseSentryDsn, parseSentryEnvelopeDsn } from './beta-sentry-utils.mjs';
import { proxyFirebaseApi } from './beta-worker-routing.mjs';
import { verifyToken } from '@clerk/backend';
import { verifyWebhook } from '@clerk/backend/webhooks';

const API_PREFIX = '/api';
const MAX_CYCLE_BYTES = 750_000;
const MAX_CLOUD_CYCLES = 100;
const MAX_CUSTOM_PRODUCTS = 16;
const MAX_USER_RECORDS = 200;
const MAX_WORKFLOW_RECORDS = 200;
const MAX_LIST_PAGE_SIZE = 10;
// Keep this synchronized with the per-user/day limit in 0001_beta_auth_data.sql.
const MAX_PRODUCT_METRIC_DAILY_EVENTS = 500;
export { MAX_PRODUCT_METRIC_DAILY_EVENTS };
const MAX_SENTRY_ENVELOPE_BYTES = 100 * 1024;
const AUTH_PROFILE_CACHE_TTL_MS = 5_000;
const AUTH_PROFILE_CACHE_MAX = 1_000;
const DEFAULT_MONTHLY_DISPLAY_PRICE = '$3/month';
const DEFAULT_ANNUAL_DISPLAY_PRICE = '$30/year';
const authProfileCache = new Map();
const PRODUCT_METRIC_EVENT_TYPES = new Set(['account_signup', 'account_signin', 'cycle_saved', 'discussion_saved', 'verification_run', 'cloud_cycle_saved', 'cloud_cycle_loaded']);

const clearAuthProfileCache = (clerkId) => {
  for (const key of authProfileCache.keys()) {
    if (key.startsWith(`${clerkId}:`)) authProfileCache.delete(key);
  }
};
function getAuthorizedParties(env) {
  const configuredParties = env.CLERK_AUTHORIZED_PARTIES || env.PUBLIC_ORIGIN || '';
  const parties = configuredParties.split(',').map((party) => party.trim().replace(/\/+$/, '')).filter(Boolean);
  if (parties.length) return parties;
  const error = new Error('Clerk authorized parties are not configured.');
  error.code = 'CLERK_CONFIG_MISSING';
  throw error;
}

async function verifyClerkIdentity(token, env) {
  const verified = await verifyToken(token, { jwtKey: env.CLERK_JWT_KEY, authorizedParties: getAuthorizedParties(env) });
  const data = verified?.data || verified;
  if (verified?.errors?.length || !data?.sub) {
    if (verified?.errors?.length) console.warn('[beta-worker] Clerk token rejected', verified.errors.map((error) => error.message).join('; '));
    return null;
  }
  return { clerkId: data.sub, cacheKey: await tokenCacheKey(data.sub, token) };
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

async function fetchClerkProfile(clerkId, env) {
  let response;
  try {
    response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }, signal: AbortSignal.timeout(3_000),
    });
  } catch (cause) {
    const error = new Error('Clerk profile service is temporarily unavailable.');
    error.code = 'CLERK_PROFILE_UNAVAILABLE';
    error.cause = cause;
    throw error;
  }
  if ([401, 403, 429].includes(response.status) || response.status >= 500) {
    const error = new Error('Clerk profile service is temporarily unavailable.');
    error.code = 'CLERK_PROFILE_UNAVAILABLE';
    throw error;
  }
  if (!response.ok) {
    console.warn('[beta-worker] Clerk profile response rejected', response.status);
    return null;
  }
  const profile = await response.json();
  const emailAddresses = Array.isArray(profile.email_addresses) ? profile.email_addresses : [];
  const primary = emailAddresses.find((entry) => entry?.id === profile.primary_email_address_id);
  const email = normalizeEmail(primary?.email_address);
  if (!email || primary?.verification?.status !== 'verified') {
    console.warn('[beta-worker] Clerk primary email is not verified', Boolean(email), primary?.verification?.status);
    return null;
  }
  return { clerkId, email, displayName: [profile.first_name, profile.last_name].filter((part) => typeof part === 'string' && part).join(' ') };
}

async function authenticate(request, env) {
  const token = readBearer(request);
  if (!token) return null;
  if (!env.CLERK_JWT_KEY || !env.CLERK_SECRET_KEY) {
    const error = new Error('Clerk verification keys are not configured.');
    error.code = 'CLERK_CONFIG_MISSING';
    throw error;
  }
  try {
    const verified = await verifyClerkIdentity(token, env);
    if (!verified) return null;
    const cached = readCachedIdentity(verified.cacheKey);
    if (cached) return cached;
    const identity = await fetchClerkProfile(verified.clerkId, env);
    if (!identity) return null;
    authProfileCache.set(verified.cacheKey, { identity, expiresAt: Date.now() + AUTH_PROFILE_CACHE_TTL_MS });
    return identity;
  } catch (error) {
    if (error?.code === 'CLERK_PROFILE_UNAVAILABLE' || error?.code === 'CLERK_CONFIG_MISSING') throw error;
    console.warn('[beta-worker] Clerk token rejected', error instanceof Error ? error.message : 'verification failed');
    return null;
  }
}

async function findMigratedStripeSubscription(env, entitlement) {
  if (typeof entitlement.stripeSubscriptionId === 'string' && entitlement.stripeSubscriptionId.startsWith('sub_')) {
    return stripeRequest(env, `subscriptions/${encodeURIComponent(entitlement.stripeSubscriptionId)}`, null, 'GET');
  }
  if (typeof entitlement.stripeCustomerId !== 'string' || !entitlement.stripeCustomerId.startsWith('cus_')) return null;
  const result = await stripeRequest(env, `subscriptions?customer=${encodeURIComponent(entitlement.stripeCustomerId)}&status=all&limit=100`, null, 'GET');
  const subscriptions = Array.isArray(result?.data) ? result.data : [];
  return subscriptions.find((item) => !entitlement.stripeSubscriptionId || item.id === entitlement.stripeSubscriptionId) || null;
}

function buildMigratedStripeEntitlement(entitlement, attempted, userId, subscription, attemptedAt) {
  const status = subscription?.status || 'inactive';
  const active = ['active', 'trialing'].includes(status);
  const betaOverrideActive = entitlement.betaOverrideActive === true;
  let effectiveSource = 'none';
  if (betaOverrideActive) effectiveSource = 'beta_override';
  else if (active) effectiveSource = 'stripe';
  const periodEnd = Number(subscription?.current_period_end)
    ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null;
  return {
    ...attempted, uid: userId, premiumActive: betaOverrideActive || active, effectiveSource,
    billingStatus: status, stripeSubscriptionId: subscription?.id || entitlement.stripeSubscriptionId || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end), currentPeriodEnd: periodEnd,
    planInterval: mapStripeInterval(subscription) || entitlement.planInterval || null,
    pendingStripeSync: false, stripeSyncAttemptAt: undefined, updatedAt: attemptedAt,
  };
}

async function refreshMigratedStripeEntitlement(env, userId) {
  if (!env.STRIPE_SECRET_KEY) return;
  const entitlement = await readJsonRecord(env.DB, 'user_entitlements', userId);
  if (!entitlement?.pendingStripeSync) return;
  const lastAttempt = Date.parse(entitlement.stripeSyncAttemptAt || '');
  if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 15 * 60 * 1000) return;
  const attemptedAt = new Date().toISOString();
  const attempted = { ...entitlement, stripeSyncAttemptAt: attemptedAt };
  await env.DB.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
    .bind(userId, JSON.stringify(attempted), attemptedAt).run();
  try {
    const subscription = await findMigratedStripeSubscription(env, entitlement);
    const updated = buildMigratedStripeEntitlement(entitlement, attempted, userId, subscription, attemptedAt);
    await env.DB.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
      .bind(userId, JSON.stringify(updated), attemptedAt).run();
  } catch (error) {
    console.warn('[beta-worker] migrated Stripe entitlement sync will retry', error instanceof Error ? error.message : 'Stripe lookup failed');
  }
}

const ensureUser = createUserEnsurer(refreshMigratedStripeEntitlement);

const BODY_TOO_LARGE = Symbol('body-too-large');
const readBody = async (request) => {
  const bytes = await readLimitedBody(request, MAX_CYCLE_BYTES);
  if (bytes === null) return BODY_TOO_LARGE;
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
};

async function stripeRequest(env, endpoint, params, method = 'POST') {
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    ...(params ? { body: new URLSearchParams(params) } : {}),
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || 'Stripe request failed.');
    error.code = body?.error?.code;
    error.stripeType = body?.error?.type;
    throw error;
  }
  return body;
}

async function handleAuthenticatedApi(request, env, url, path, user) {
  const context = { request, env, url, path, user };
  const handlers = [
    handleAccountBootstrapAndBilling,
    handleAccountSettingsAndMetrics,
    handleCloudCycleRoutes,
    handleWorkflowAwarenessRoutes,
    handleCustomProductRoutes,
    handleUserRecordRoutes,
  ];
  for (const handler of handlers) {
    const response = await handler(context);
    if (response) return response;
  }
  return json({ error: 'Not found.' }, 404);
}
async function handleAccountBootstrapAndBilling({ request, env, path, user }) {
  if (path === '/api/me/bootstrap' && request.method === 'GET') {
    return json({ user: { id: user.clerk_id, email: user.email, displayName: user.display_name, betaAccess: Boolean(user.beta_access), migrationStatus: user.migration_status },
      settings: await readJsonRecord(env.DB, 'user_settings', user.clerk_id),
      entitlement: await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id),
      metrics: await readJsonRecord(env.DB, 'user_metrics', user.clerk_id) });
  }

  if (path === '/api/billing/checkout' && request.method === 'POST') {
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Billing is not available on this deployment.' }, 503);
    const body = await readBody(request);
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    const plan = body?.plan;
    let price = null;
    if (plan === 'monthly') price = env.STRIPE_PRICE_MONTHLY;
    else if (plan === 'annual') price = env.STRIPE_PRICE_ANNUAL_STANDARD;
    if (!price) return json({ error: 'This billing plan is not available.' }, 400);
    if (!env.PUBLIC_ORIGIN) return json({ error: 'Billing is not configured.' }, 503);
    const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id) || {};
    const params = {
      mode: 'subscription',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      success_url: `${env.PUBLIC_ORIGIN}/account?checkout=success`,
      cancel_url: `${env.PUBLIC_ORIGIN}/pricing?checkout=cancelled`,
      ...(!entitlement.stripeCustomerId ? { customer_email: user.email } : {}),
      client_reference_id: user.clerk_id,
      'metadata[clerkId]': user.clerk_id,
      'metadata[legacyUid]': user.legacy_uid || '',
      'metadata[plan]': plan,
      'subscription_data[metadata][clerkId]': user.clerk_id,
      'subscription_data[metadata][legacyUid]': user.legacy_uid || '',
      'subscription_data[metadata][plan]': plan,
      ...(entitlement.stripeCustomerId ? { customer: entitlement.stripeCustomerId } : {}),
    };
    let session;
    try { session = await stripeRequest(env, 'checkout/sessions', params); }
    catch { return json({ error: 'Unable to start checkout with Stripe.' }, 502); }
    if (typeof session?.url !== 'string' || !session.url) return json({ error: 'Stripe checkout session did not include a URL.' }, 502);
    return json({ url: session.url });
  }

  if (path === '/api/billing/portal' && request.method === 'POST') {
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Billing is not available on this deployment.' }, 503);
    if (!env.PUBLIC_ORIGIN) return json({ error: 'Billing is not configured.' }, 503);
    const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
    if (!entitlement?.stripeCustomerId) return json({ error: 'No billing account is associated with this user.' }, 400);
    let portal;
    try {
      portal = await stripeRequest(env, 'billing_portal/sessions', {
        customer: entitlement.stripeCustomerId,
        return_url: `${env.PUBLIC_ORIGIN}/account`,
      });
    } catch { return json({ error: 'Unable to open the Stripe billing portal.' }, 502); }
    if (typeof portal?.url !== 'string' || !portal.url) return json({ error: 'Stripe billing portal session did not include a URL.' }, 502);
    return json({ url: portal.url });
  }

  if (path === '/api/beta/claim' && request.method === 'POST') {
    if (!user.beta_access && env.BETA_INVITE_TOKEN) {
      const body = await readBody(request);
      if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
      if (!body || !(await timingSafeStringEqual(body.token, env.BETA_INVITE_TOKEN)) || (env.BETA_INVITE_PATH && body.invitePath !== env.BETA_INVITE_PATH)) return json({ error: 'Invalid invite.' }, 403);
      await env.DB.prepare('UPDATE users SET beta_access = 1, updated_at = ? WHERE clerk_id = ?').bind(new Date().toISOString(), user.clerk_id).run();
    }
    const updated = await env.DB.prepare('SELECT beta_access FROM users WHERE clerk_id = ?').bind(user.clerk_id).first();
    return json({ betaAccess: Boolean(updated?.beta_access) });
  }
  return null;
}

async function handleAccountSettingsAndMetrics({ request, env, url, path, user }) {
  if (path === '/api/user/settings' && request.method === 'GET') return json({ settings: await readJsonRecord(env.DB, 'user_settings', user.clerk_id) });
  if (path === '/api/user/settings' && request.method === 'PUT') {
    const body = await readBody(request);
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    if (!isObject(body?.settings)) return json({ error: 'Invalid settings.' }, 400);
    const dataJson = JSON.stringify(body.settings);
    if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Settings are too large.' }, 413);
    await env.DB.prepare(`INSERT INTO user_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
      .bind(user.clerk_id, dataJson, new Date().toISOString()).run();
    return json({ success: true });
  }

  if (path === '/api/user/entitlement' && request.method === 'GET') return json({ entitlement: await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id) });
  if (path === '/api/user/metrics' && request.method === 'GET') return json({ metrics: await readJsonRecord(env.DB, 'user_metrics', user.clerk_id) });
  if (path === '/api/admin/metrics' && request.method === 'GET') {
    const allowed = `${env.ADMIN_CLERK_ID_ALLOWLIST || ''},${env.ADMIN_UID_ALLOWLIST || ''}`.split(',').map((value) => value.trim()).filter(Boolean);
    if (!allowed.includes(user.clerk_id) && !(user.legacy_uid && allowed.includes(user.legacy_uid))) return json({ error: 'Admin access denied.' }, 403);
    const requestedWindow = url.searchParams.get('window');
    let days = null;
    if (requestedWindow === '30') days = 30;
    else if (requestedWindow === '7') days = 7;
    if (!days) return json({ error: 'Invalid metrics window.' }, 400);
    const windowStart = `-${days - 1} days`;
    const [accounts, premium, storage, rows] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM user_entitlements WHERE json_extract(data_json, '$.billingStatus') IN ('active', 'trialing')").first(),
      env.DB.prepare('SELECT COALESCE(SUM(payload_bytes), 0) AS bytes FROM cloud_cycles').first(),
      env.DB.prepare(`SELECT event_date AS date, COUNT(DISTINCT CASE WHEN event_type NOT IN ('upgrades', 'cancellations') THEN installation_id END) AS activeDevices,
        COUNT(DISTINCT user_id) AS activeSignedInAccounts,
        SUM(CASE WHEN event_type = 'account_signup' THEN 1 ELSE 0 END) AS signups,
        SUM(CASE WHEN event_type = 'account_signin' THEN 1 ELSE 0 END) AS signIns,
        SUM(CASE WHEN event_type = 'upgrades' THEN 1 ELSE 0 END) AS upgrades,
        SUM(CASE WHEN event_type = 'cancellations' THEN 1 ELSE 0 END) AS cancellations,
        SUM(CASE WHEN event_type IN ('cloud_cycle_saved', 'cycle_saved') THEN 1 ELSE 0 END) AS cloudSaves,
        SUM(CASE WHEN event_type = 'cloud_cycle_loaded' THEN 1 ELSE 0 END) AS cloudLoads
        FROM product_metric_events WHERE event_date >= date('now', ?) GROUP BY event_date ORDER BY event_date ASC`)
        .bind(windowStart).all(),
    ]);
    const dailyMetrics = rows.results || [];
    const totals = dailyMetrics.reduce((result, row) => {
      for (const key of ['signups', 'signIns', 'upgrades', 'cancellations', 'cloudSaves', 'cloudLoads']) result[key] += Number(row[key] || 0);
      return result;
    }, { signups: 0, signIns: 0, upgrades: 0, cancellations: 0, cloudSaves: 0, cloudLoads: 0 });
    const latest = dailyMetrics.at(-1) || {};
    const summary = { totalAccounts: Number(accounts?.count || 0), activeDevices: Number(latest.activeDevices || 0),
      activeSignedInAccounts: Number(latest.activeSignedInAccounts || 0), premiumSubscriptions: Number(premium?.count || 0),
      storageBytes: Number(storage?.bytes || 0), ...totals };
    return json({ metricsEnabled: true, window: days, summary, dailyMetrics });
  }

  if (path === '/api/metrics/event' && request.method === 'POST') {
    const body = await readBody(request);
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    const installationId = typeof body?.installationId === 'string' ? body.installationId : '';
    if (!PRODUCT_METRIC_EVENT_TYPES.has(body?.event) || installationId.length < 8 || installationId.length > 128) return json({ error: 'Invalid product metric event.' }, 400);
    const eventDate = new Date().toISOString().slice(0, 10);
    try {
      await env.DB.prepare(`INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), eventDate, installationId, body.event, user.clerk_id).run();
    } catch (error) {
      if (String(error?.message || '').includes('product_metric_daily_quota_reached')) return json({ error: 'Daily metrics event limit reached.' }, 429);
      throw error;
    }
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

async function listCloudCycles(env, user) {
  const result = await env.DB.prepare(`SELECT id, user_id AS userId, label, cycle_date AS cycleDate, metadata_json, created_at AS createdAt, updated_at AS updatedAt
    FROM cloud_cycles WHERE user_id = ? ORDER BY updated_at DESC`).bind(user.clerk_id).all();
  return json({ cycles: (result.results || []).map((row) => {
    const stored = parseJson(row.metadata_json) || {};
    const metadata = { id: row.id, userId: row.userId, label: row.label, cycleDate: row.cycleDate,
      createdAt: row.createdAt, updatedAt: row.updatedAt, forecastDays: stored.forecastDays,
      totalOutlooks: stored.totalOutlooks, totalFeatures: stored.totalFeatures, isReadOnly: stored.isReadOnly,
      payloadHash: stored.payloadHash, workspaceId: stored.workspaceId, workflowMetadata: stored.workflowMetadata };
    return { id: row.id, userId: row.userId, label: row.label, cycleDate: row.cycleDate,
      createdAt: row.createdAt, updatedAt: row.updatedAt, workflowMetadata: stored.workflowMetadata, metadata };
  }) });
}

async function writeCloudCycle(env, user, data) {
  const now = new Date().toISOString();
  try {
    return await env.DB.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM cloud_cycles WHERE user_id = ? AND id = ?)
        OR (SELECT COUNT(*) FROM cloud_cycles WHERE user_id = ? AND migration_import = 0) < ?
      ON CONFLICT(user_id, id) DO UPDATE SET label = excluded.label, cycle_date = excluded.cycle_date,
        metadata_json = json_set(excluded.metadata_json, '$.createdAt', COALESCE(json_extract(cloud_cycles.metadata_json, '$.createdAt'), json_extract(excluded.metadata_json, '$.createdAt'))),
        payload_json = excluded.payload_json, payload_bytes = excluded.payload_bytes, updated_at = excluded.updated_at`)
      .bind(data.id, user.clerk_id, data.label, data.cycleDate, JSON.stringify({ ...data.metadata, userId: user.clerk_id }),
        data.payloadJson, data.bytes, now, now, user.clerk_id, data.id, user.clerk_id, MAX_CLOUD_CYCLES).run();
  } catch (error) {
    if (String(error?.message || '').includes('cloud_cycle_quota_reached')) return { response: json({ error: 'Cloud storage quota reached.' }, 409) };
    if (String(error?.message || '').includes('cloud_cycle_too_large') || String(error?.message || '').includes('CHECK constraint failed')) {
      return { response: json({ error: 'Cloud cycle is too large.' }, 413) };
    }
    throw error;
  }
}

async function saveCloudCycle(request, env, user) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const cycleDate = typeof body?.cycleDate === 'string' ? body.cycleDate : '';
  const payloadJson = typeof body?.payloadJson === 'string' ? body.payloadJson : '';
  const data = { id, label, cycleDate, payloadJson, bytes: new TextEncoder().encode(payloadJson).length, metadata: body?.metadata };
  if (!id || id.length > 128 || id.includes('/') || !label || label.length > 200 || !cycleDate || cycleDate.length > 32 || data.bytes > MAX_CYCLE_BYTES || !isObject(data.metadata)) return json({ error: 'Invalid cloud cycle payload.' }, 400);
  const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
  if (entitlement?.premiumActive !== true) return json({ error: 'Premium cloud storage is required.' }, 403);
  try { JSON.parse(payloadJson); } catch { return json({ error: 'Invalid cloud cycle payload.' }, 400); }
  const saved = await writeCloudCycle(env, user, data);
  if (saved.response) return saved.response;
  if (!saved.meta.changes) {
    const existing = await env.DB.prepare('SELECT 1 AS found FROM cloud_cycles WHERE user_id = ? AND id = ?').bind(user.clerk_id, id).first();
    if (!existing) return json({ error: 'Cloud storage quota reached.' }, 409);
  }
  return json({ success: true, data: id });
}

async function readCloudCycle(env, id, user) {
  const row = await env.DB.prepare('SELECT * FROM cloud_cycles WHERE id = ? AND user_id = ?').bind(id, user.clerk_id).first();
  if (!row) return json({ error: 'Cloud cycle not found.' }, 404);
  return json({ cycle: { id: row.id, userId: row.user_id, label: row.label, cycleDate: row.cycle_date,
    createdAt: row.created_at, updatedAt: row.updated_at, metadata: parseJson(row.metadata_json), payload: parseJson(row.payload_json) } });
}

async function updateCloudCycleLabel(request, env, id, user) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  if (!label || label.length > 200) return json({ error: 'Invalid label.' }, 400);
  const updatedAt = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE cloud_cycles SET label = ?, updated_at = ?,
    metadata_json = json_set(metadata_json, '$.label', ?, '$.updatedAt', ?) WHERE id = ? AND user_id = ?`)
    .bind(label, updatedAt, label, updatedAt, id, user.clerk_id).run();
  return result.meta.changes ? json({ success: true }) : json({ error: 'Cloud cycle not found.' }, 404);
}

async function handleCloudCycleById({ request, env, path, user }) {
  const match = path.match(/^\/api\/cloud-cycles\/([^/]+)$/);
  if (!match) return null;
  const id = decodePathId(match[1]);
  if (!id || id.includes('/')) return json({ error: 'Invalid cloud cycle ID.' }, 400);
  if (request.method === 'GET') return readCloudCycle(env, id, user);
  if (request.method === 'PATCH') return updateCloudCycleLabel(request, env, id, user);
  if (request.method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM cloud_cycles WHERE id = ? AND user_id = ?').bind(id, user.clerk_id).run();
    return result.meta.changes ? json({ success: true }) : json({ error: 'Cloud cycle not found.' }, 404);
  }
  return null;
}

async function handleCloudCycleRoutes(context) {
  const { request, env, path, user } = context;
  if (path === '/api/cloud-cycles' && request.method === 'GET') return listCloudCycles(env, user);
  if (path === '/api/cloud-cycles' && request.method === 'POST') return saveCloudCycle(request, env, user);
  return handleCloudCycleById(context);
}

async function listWorkflowAwareness(env, url, user) {
  const requestedUserId = url.searchParams.get('userId');
  if (requestedUserId && requestedUserId !== user.clerk_id) return json({ error: 'Account does not match session.' }, 403);
  const page = Number(url.searchParams.get('page') || 0);
  if (!Number.isSafeInteger(page) || page < 0) return json({ error: 'Invalid page.' }, 400);
  const result = await env.DB.prepare(`SELECT cycle_id AS id, data_json FROM workflow_awareness
    WHERE user_id = ? ORDER BY cycle_id LIMIT ${MAX_LIST_PAGE_SIZE} OFFSET ?`)
    .bind(user.clerk_id, page * MAX_LIST_PAGE_SIZE).all();
  const rows = result.results || [];
  return json({ records: rows.map((row) => parseJson(row.data_json)).filter(Boolean),
    nextPage: rows.length === MAX_LIST_PAGE_SIZE ? page + 1 : null });
}

async function saveWorkflowAwareness(request, env, user) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  if (!isObject(body?.record?.metadata) || typeof body.record.metadata.cycleId !== 'string') return json({ error: 'Invalid workflow record.' }, 400);
  const cycleId = body.record.metadata.cycleId.trim();
  if (!cycleId || cycleId.includes('/')) return json({ error: 'Invalid workflow record.' }, 400);
  body.record.metadata.cycleId = cycleId;
  const dataJson = JSON.stringify(body.record);
  if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Workflow record is too large.' }, 413);
  const existingCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM workflow_awareness WHERE user_id = ? AND migration_import = 0').bind(user.clerk_id).first();
  if (Number(existingCount?.count || 0) >= MAX_WORKFLOW_RECORDS) {
    const existing = await env.DB.prepare('SELECT 1 AS found FROM workflow_awareness WHERE user_id = ? AND cycle_id = ?')
      .bind(user.clerk_id, cycleId).first();
    if (!existing) return json({ error: 'Workflow record quota reached.' }, 409);
  }
  try {
    await env.DB.prepare(`INSERT INTO workflow_awareness (user_id, cycle_id, data_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, cycle_id) DO UPDATE SET data_json = excluded.data_json`)
      .bind(user.clerk_id, cycleId, dataJson).run();
  } catch (error) {
    if (String(error?.message || '').includes('workflow_awareness_quota_reached')) return json({ error: 'Workflow record quota reached.' }, 409);
    throw error;
  }
  return json({ success: true });
}

async function handleWorkflowDelete(env, path, user) {
  const awarenessMatch = path.match(/^\/api\/workflow-awareness\/([^/]+)$/);
  const cycleId = awarenessMatch ? decodePathId(awarenessMatch[1]) : null;
  if (awarenessMatch && (!cycleId || cycleId.includes('/'))) return json({ error: 'Invalid cycle ID.' }, 400);
  const query = cycleId === null
    ? env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ?').bind(user.clerk_id)
    : env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ? AND cycle_id = ?').bind(user.clerk_id, cycleId);
  await query.run();
  return json({ success: true });
}

async function handleWorkflowAwarenessRoutes({ request, env, url, path, user }) {
  if (path === '/api/workflow-awareness' && request.method === 'GET') return listWorkflowAwareness(env, url, user);
  if (path === '/api/workflow-awareness' && request.method === 'PUT') return saveWorkflowAwareness(request, env, user);
  if ((path === '/api/workflow-awareness' || /^\/api\/workflow-awareness\/[^/]+$/.test(path)) && request.method === 'DELETE') {
    return handleWorkflowDelete(env, path, user);
  }
  return null;
}

async function listCustomProducts(env, url, user) {
  const page = Number(url.searchParams.get('page') || 0);
  if (!Number.isSafeInteger(page) || page < 0) return json({ error: 'Invalid page.' }, 400);
  const result = await env.DB.prepare(`SELECT data_json FROM custom_products WHERE user_id = ? ORDER BY slot_id LIMIT ${MAX_LIST_PAGE_SIZE} OFFSET ?`)
    .bind(user.clerk_id, page * MAX_LIST_PAGE_SIZE).all();
  const rows = result.results || [];
  return json({ products: rows.map((row) => parseJson(row.data_json)).filter(Boolean),
    nextPage: rows.length === MAX_LIST_PAGE_SIZE ? page + 1 : null });
}

async function reserveCustomProductSlot(env, userId, product, dataJson) {
  const slots = [...Array.from({ length: MAX_CUSTOM_PRODUCTS }, (_, index) => `('product-${String(index + 1).padStart(2, '0')}')`),
    ...Array.from({ length: MAX_CUSTOM_PRODUCTS }, (_, index) => `('active-${String(index + 1).padStart(2, '0')}')`)].join(', ');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await env.DB.prepare(`WITH slots(slot_id) AS (VALUES ${slots})
        INSERT INTO custom_products (user_id, slot_id, product_id, data_json)
        SELECT ?, slots.slot_id, ?, ? FROM slots
        WHERE NOT EXISTS (SELECT 1 FROM custom_products WHERE user_id = ? AND slot_id = slots.slot_id)
          AND (SELECT COUNT(*) FROM custom_products WHERE user_id = ? AND migration_import = 0) < ?
        ORDER BY CASE WHEN slots.slot_id LIKE 'product-%' THEN 0 ELSE 1 END, slots.slot_id LIMIT 1`)
        .bind(userId, product.id, dataJson, userId, userId, MAX_CUSTOM_PRODUCTS).run();
      if (!result.meta.changes) return json({ error: 'Custom product limit reached.' }, 409);
      return null;
    } catch (error) {
      if (String(error?.message || '').includes('custom_product_quota_reached')) return json({ error: 'Custom product limit reached.' }, 409);
      if (!String(error?.message || '').includes('UNIQUE constraint failed')) throw error;
      const duplicate = await env.DB.prepare('SELECT 1 AS found FROM custom_products WHERE user_id = ? AND product_id = ?').bind(userId, product.id).first();
      if (duplicate) return json({ error: 'Custom product already exists.' }, 409);
      if (attempt === 1) return json({ error: 'Custom product limit reached. Refresh and try again.' }, 409);
    }
  }
  return null;
}

async function createCustomProduct(request, env, user) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const product = body?.product;
  const productId = typeof product?.id === 'string' ? product.id.trim() : '';
  if (!isObject(product) || !productId || productId.length > 128 || productId.includes('/') || product.userId !== user.clerk_id || product.version !== 1 || product.builtIn === true) return json({ error: 'Invalid custom product.' }, 400);
  product.id = productId;
  const dataJson = JSON.stringify(product);
  if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Custom product is too large.' }, 413);
  const failure = await reserveCustomProductSlot(env, user.clerk_id, product, dataJson);
  return failure || json({ success: true, product });
}

async function patchCustomProduct(request, env, user, productId, currentRow, current) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid custom product.' }, 400);
  const product = body.product;
  if (!isObject(product) || product.id !== productId || product.userId !== user.clerk_id || product.builtIn === true || !Number.isInteger(body.expectedVersion) || body.expectedVersion !== current.version || product.version !== current.version + 1) return json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
  const dataJson = JSON.stringify(product);
  if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Custom product is too large.' }, 413);
  const result = await env.DB.prepare(`UPDATE custom_products SET data_json = ? WHERE user_id = ? AND slot_id = ? AND product_id = ? AND json_extract(data_json, '$.version') = ?`)
    .bind(dataJson, user.clerk_id, currentRow.slot_id, productId, body.expectedVersion).run();
  return result.meta.changes ? json({ success: true, product }) : json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
}

async function deleteCustomProduct(request, env, user, productId, currentRow, current) {
  const ifMatch = request.headers.get('If-Match')?.trim() || '';
  const body = ifMatch ? null : await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const headerVersions = [...ifMatch.matchAll(/(?:^|,\s*)(?:W\/)?"?(\d+)"?(?=\s*(?:,|$))/g)].map((match) => Number(match[1]));
  let expectedVersion;
  if (ifMatch === '*') expectedVersion = current.version;
  else if (ifMatch) expectedVersion = headerVersions.includes(current.version) ? current.version : NaN;
  else expectedVersion = body?.expectedVersion;
  if (!Number.isInteger(expectedVersion) || expectedVersion !== current.version) return json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
  const result = await env.DB.prepare(`DELETE FROM custom_products WHERE user_id = ? AND slot_id = ? AND product_id = ?
    AND json_extract(data_json, '$.version') = ?`).bind(user.clerk_id, currentRow.slot_id, productId, expectedVersion).run();
  return result.meta.changes ? json({ success: true }) : json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
}

async function updateCustomProduct({ request, env, path, user }) {
  const match = path.match(/^\/api\/custom-products\/([^/]+)$/);
  if (!match) return null;
  if (request.method !== 'PATCH' && request.method !== 'DELETE') return json({ error: 'Method not allowed.' }, 405);
  const productId = decodePathId(match[1]);
  if (!productId || productId.includes('/')) return json({ error: 'Invalid custom product ID.' }, 400);
  const currentRow = await env.DB.prepare('SELECT slot_id, data_json FROM custom_products WHERE user_id = ? AND product_id = ?').bind(user.clerk_id, productId).first();
  if (!currentRow) return json({ error: 'Custom product not found.' }, 404);
  const current = parseJson(currentRow.data_json) || {};
  if (request.method === 'PATCH') return patchCustomProduct(request, env, user, productId, currentRow, current);
  return deleteCustomProduct(request, env, user, productId, currentRow, current);
}

async function handleCustomProductRoutes(context) {
  const { request, env, url, path, user } = context;
  if (path === '/api/custom-products' && request.method === 'GET') return listCustomProducts(env, url, user);
  if (path === '/api/custom-products' && request.method === 'POST') return createCustomProduct(request, env, user);
  return updateCustomProduct(context);
}

async function handleUserRecordRoutes({ request, env, url, path, user }) {
  const recordRoute = path.match(/^\/api\/(forecasts|discussions|verifications)(?:\/([^/]+))?$/);
  if (recordRoute) {
    const recordType = { forecasts: 'forecast', discussions: 'discussion', verifications: 'verification' }[recordRoute[1]];
    const recordId = recordRoute[2] ? decodePathId(recordRoute[2]) : '';
    if (recordId === null || recordId.includes('/')) return json({ error: 'Invalid record ID.' }, 400);
    if (request.method === 'GET' && !recordId) {
      const page = Number(url.searchParams.get('page') || 0);
      if (!Number.isSafeInteger(page) || page < 0) return json({ error: 'Invalid page.' }, 400);
      const rows = await env.DB.prepare(`SELECT record_id, data_json, created_at, updated_at FROM user_records
        WHERE user_id = ? AND record_type = ? ORDER BY updated_at DESC, record_id DESC LIMIT ${MAX_LIST_PAGE_SIZE} OFFSET ?`)
        .bind(user.clerk_id, recordType, page * MAX_LIST_PAGE_SIZE).all();
      const results = rows.results || [];
      return json({ records: results.map((row) => ({ id: row.record_id, data: parseJson(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at })),
        nextPage: results.length === MAX_LIST_PAGE_SIZE ? page + 1 : null });
    }
    if (request.method === 'PUT' && !recordId) {
      const body = await readBody(request);
      if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
      const id = typeof body?.id === 'string' ? body.id.trim() : '';
      if (!id || id.length > 128 || id.includes('/') || !isObject(body?.data)) return json({ error: 'Invalid record.' }, 400);
      const dataJson = JSON.stringify(body.data);
    if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Record is too large.' }, 413);
      const now = new Date().toISOString();
      let saveResult;
      try {
        saveResult = await env.DB.prepare(`INSERT INTO user_records (user_id, record_type, record_id, data_json, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_records WHERE user_id = ? AND record_type = ? AND record_id = ?)
          OR (SELECT COUNT(*) FROM user_records WHERE user_id = ? AND record_type = ?) < ?
        ON CONFLICT(user_id, record_type, record_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
          .bind(user.clerk_id, recordType, id, dataJson, now, now, user.clerk_id, recordType, id, user.clerk_id, recordType, MAX_USER_RECORDS).run();
      } catch (error) {
        if (String(error?.message || '').includes('user_record_quota_reached')) return json({ error: 'Record quota reached.' }, 409);
        throw error;
      }
      if (!saveResult.meta.changes) return json({ error: 'Record quota reached.' }, 409);
      return json({ success: true, id });
    }
    if (request.method === 'GET' && recordId) {
      const row = await env.DB.prepare('SELECT record_id, data_json, created_at, updated_at FROM user_records WHERE user_id = ? AND record_type = ? AND record_id = ?')
        .bind(user.clerk_id, recordType, recordId).first();
      return row ? json({ record: { id: row.record_id, data: parseJson(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at } }) : json({ error: 'Record not found.' }, 404);
    }
    if (request.method === 'DELETE' && recordId) {
      await env.DB.prepare('DELETE FROM user_records WHERE user_id = ? AND record_type = ? AND record_id = ?')
        .bind(user.clerk_id, recordType, recordId).run();
      return json({ success: true });
    }
  }
  return null;
}

async function claimStripeEvent(db, eventId) {
  const claim = await db.prepare('INSERT OR IGNORE INTO stripe_events (event_id, processed_at, status) VALUES (?, ?, ?)')
    .bind(eventId, new Date().toISOString(), 'processing').run();
  if (claim.meta.changes !== 0) return null;
  const prior = await db.prepare('SELECT status, processed_at FROM stripe_events WHERE event_id = ?').bind(eventId).first();
  if (prior?.status === 'completed') return json({ received: true, duplicate: true });
  const age = Date.now() - Date.parse(prior?.processed_at || '');
  if (prior?.status !== 'processing' || age <= 10 * 60 * 1000) {
    return json({ received: false, error: 'Webhook delivery is already being processed.' }, 503);
  }
  const refreshed = await db.prepare(`UPDATE stripe_events SET processed_at = ? WHERE event_id = ? AND status = ? AND processed_at = ?`)
    .bind(new Date().toISOString(), eventId, 'processing', prior.processed_at).run();
  return refreshed.meta.changes ? null : json({ received: false, error: 'Webhook delivery is already being processed.' }, 503);
}

async function resolveStripeOwner(db, metadata, object, subscription) {
  const clerkId = metadata.clerkId || object.client_reference_id || '';
  const legacyUid = metadata.legacyUid || '';
  let owner = null;
  if (clerkId) owner = await db.prepare('SELECT clerk_id FROM users WHERE clerk_id = ?').bind(clerkId).first();
  if (!owner && legacyUid) owner = await db.prepare('SELECT clerk_id FROM users WHERE legacy_uid = ?').bind(legacyUid).first();
  const customerId = subscription?.customer || object?.customer;
  if (!owner && typeof customerId === 'string') {
    owner = await db.prepare(`SELECT user_id AS clerk_id FROM user_entitlements WHERE json_extract(data_json, '$.stripeCustomerId') = ?`).bind(customerId).first();
  }
  return { owner, clerkId, legacyUid };
}

function buildStripeEntitlement({ ownerId, prior, subscription, object, eventType }) {
  const status = subscription?.status || (eventType === 'checkout.session.completed' ? 'active' : 'inactive');
  const active = ['active', 'trialing'].includes(status);
  const periodEnd = Number(subscription?.current_period_end) ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null;
  let effectiveSource = 'none';
  if (prior.betaOverrideActive === true) effectiveSource = 'beta_override';
  else if (active) effectiveSource = 'stripe';
  return {
    ...prior, uid: ownerId, stripeCustomerId: subscription?.customer || object?.customer || prior.stripeCustomerId || null,
    stripeSubscriptionId: subscription?.id || object?.subscription || null, billingStatus: status,
    premiumActive: prior.betaOverrideActive === true || active, effectiveSource,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end), currentPeriodEnd: periodEnd,
    planInterval: mapStripeInterval(subscription) || prior.planInterval || null,
    updatedAt: new Date().toISOString(),
  };
}

async function writeStripeEntitlement(db, { event, ownerId, prior, subscription, object }) {
  const entitlement = buildStripeEntitlement({ ownerId, prior, subscription, object, eventType: event.type });
  const statements = [db.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
    .bind(ownerId, JSON.stringify(entitlement), entitlement.updatedAt)];
  const metricType = !prior.premiumActive && entitlement.premiumActive ? 'upgrades'
    : prior.premiumActive && !entitlement.premiumActive ? 'cancellations' : null;
  if (metricType) {
    statements.push(db.prepare('INSERT OR IGNORE INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id) VALUES (?, ?, ?, ?, ?)')
      .bind(`stripe:${event.id}:${metricType === 'upgrades' ? 'upgrade' : 'cancellation'}`, entitlement.updatedAt.slice(0, 10), event.id, metricType, ownerId));
  }
  try { await db.batch(statements); }
  catch (error) {
    if (!metricType || !String(error?.message || '').includes('product_metric_daily_quota_reached')) throw error;
    console.warn('[beta-worker] Stripe billing metric dropped by daily quota', event.id);
    await db.batch(statements.slice(0, 1));
  }
}

async function processStripeSubscriptionEvent(event, object, env) {
  const isCheckout = event.type === 'checkout.session.completed' && object.subscription;
  if (!event.type.startsWith('customer.subscription.') && !isCheckout) return null;
  const subscription = isCheckout
    ? await stripeRequest(env, `subscriptions/${encodeURIComponent(object.subscription)}`, null, 'GET')
    : object;
  const identity = await resolveStripeOwner(env.DB, subscription.metadata || object.metadata || {}, object, subscription);
  if (identity.owner) {
    const prior = await readJsonRecord(env.DB, 'user_entitlements', identity.owner.clerk_id) || {};
    await writeStripeEntitlement(env.DB, { event, ownerId: identity.owner.clerk_id, prior, subscription, object });
    return null;
  }
  if (!identity.clerkId && !identity.legacyUid) return json({ received: true, ignored: 'missing-account-metadata' });
  if (identity.clerkId && env.CLERK_SECRET_KEY) {
    const clerkUser = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(identity.clerkId)}`, {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }, signal: AbortSignal.timeout(3_000),
    });
    if (clerkUser.status === 404) return json({ received: true, ignored: 'deleted-account' });
    if (clerkUser.status === 429 || clerkUser.status >= 500) throw new Error('Clerk user lookup is temporarily unavailable.');
    if (!clerkUser.ok) return json({ received: false, error: 'Clerk user lookup failed.' }, 500);
  }
  await env.DB.prepare('DELETE FROM stripe_events WHERE event_id = ?').bind(event.id).run();
  return json({ received: false, error: 'Billing user is not provisioned yet.' }, 503);
}

async function readStripeWebhookEvent(request, env) {
  if (!env.DB) return { response: json({ error: 'Beta database is unavailable.' }, 503) };
  if (!env.STRIPE_WEBHOOK_SECRET) return { response: json({ error: 'Billing webhook is not configured.' }, 503) };
  const rawBytes = await readLimitedBody(request, MAX_CYCLE_BYTES);
  if (rawBytes === null) return { response: json({ error: 'Webhook payload is too large.' }, 413) };
  const raw = new TextDecoder().decode(rawBytes);
  if (!(await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return { response: json({ error: 'Invalid Stripe signature.' }, 400) };
  }
  let event;
  try { event = JSON.parse(raw); } catch { return { response: json({ error: 'Invalid webhook payload.' }, 400) }; }
  if (typeof event?.id !== 'string' || !event.id || typeof event.type !== 'string') {
    return { response: json({ error: 'Invalid webhook payload.' }, 400) };
  }
  return { event, object: event.data?.object || {} };
}

async function handleStripeWebhook(request, env) {
  const parsed = await readStripeWebhookEvent(request, env);
  if (parsed.response) return parsed.response;
  const { event, object } = parsed;
  if (event.type === 'checkout.session.completed' && object.subscription && !env.STRIPE_SECRET_KEY) {
    return json({ error: 'Billing is not configured.' }, 503);
  }
  const claimResponse = await claimStripeEvent(env.DB, event.id);
  if (claimResponse) return claimResponse;
  try {
    const response = await processStripeSubscriptionEvent(event, object, env);
    if (response) {
      if (response.status >= 400) await env.DB.prepare('DELETE FROM stripe_events WHERE event_id = ?').bind(event.id).run();
      else await env.DB.prepare('UPDATE stripe_events SET status = ?, processed_at = ? WHERE event_id = ?')
          .bind('completed', new Date().toISOString(), event.id).run();
      return response;
    }
    await env.DB.prepare('UPDATE stripe_events SET status = ?, processed_at = ? WHERE event_id = ?')
      .bind('completed', new Date().toISOString(), event.id).run();
    return json({ received: true });
  } catch (error) {
    await env.DB.prepare('DELETE FROM stripe_events WHERE event_id = ?').bind(event.id).run();
    throw error;
  }
}

async function handleHealthCheck(env) {
  if (!env.DB) return json({ status: 'error', service: 'gfc-beta-worker', database: false }, 503);
  try {
    await env.DB.prepare(`SELECT (SELECT 1 FROM users LIMIT 1) AS users,
      (SELECT 1 FROM user_settings LIMIT 1) AS settings, (SELECT 1 FROM user_entitlements LIMIT 1) AS entitlements,
      (SELECT 1 FROM user_metrics LIMIT 1) AS metrics, (SELECT 1 FROM cloud_cycles LIMIT 1) AS cloud_cycles,
      (SELECT 1 FROM workflow_awareness LIMIT 1) AS awareness, (SELECT 1 FROM custom_products LIMIT 1) AS products,
      (SELECT 1 FROM user_records LIMIT 1) AS records, (SELECT 1 FROM stripe_events LIMIT 1) AS stripe_events`).first();
    return json({ status: 'ok', service: 'gfc-beta-worker', database: true });
  } catch {
    return json({ status: 'error', service: 'gfc-beta-worker', database: false }, 503);
  }
}

async function handleSentryTunnel(request, env) {
  const declaredSize = Number(request.headers.get('Content-Length') || 0);
  if (declaredSize > MAX_SENTRY_ENVELOPE_BYTES) return json({ error: 'Sentry envelope is too large.' }, 413);
  const envelope = await readLimitedBody(request, MAX_SENTRY_ENVELOPE_BYTES);
  if (!envelope) return json({ error: 'Sentry envelope is too large.' }, 413);
  if (!envelope.length) return json({ error: 'Invalid Sentry envelope.' }, 400);
  const configured = parseSentryDsn(env.SENTRY_BROWSER_DSN || env.SENTRY_DSN);
  const incoming = parseSentryEnvelopeDsn(envelope);
  if (!configured || !incoming || configured.host !== incoming.host || configured.projectId !== incoming.projectId) return json({ error: 'Invalid Sentry envelope.' }, 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://${configured.host}/api/${configured.projectId}/envelope/`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: envelope, signal: controller.signal,
    });
    return new Response(null, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return json({ error: error?.name === 'AbortError' ? 'Sentry is temporarily unavailable.' : 'Unable to forward Sentry envelope.' }, error?.name === 'AbortError' ? 504 : 502);
  } finally { clearTimeout(timeout); }
}

async function handlePublicApi(request, env, path) {
  if (path === '/api/health' && request.method === 'GET') return handleHealthCheck(env);
  if (path === '/api/billing/config' && request.method === 'GET') {
    const checkoutEnabled = Boolean(env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_MONTHLY || env.STRIPE_PRICE_ANNUAL_STANDARD));
    return json({ billingEnabled: Boolean(env.STRIPE_SECRET_KEY), checkoutEnabled, annualPromoActive: false,
      monthlyDisplayPrice: env.MONTHLY_DISPLAY_PRICE || DEFAULT_MONTHLY_DISPLAY_PRICE,
      annualDisplayPrice: env.ANNUAL_DISPLAY_PRICE || DEFAULT_ANNUAL_DISPLAY_PRICE });
  }
  if (path === '/api/capabilities/status' && request.method === 'GET') {
    return json({ capabilities: { TSTM_GENERATION_ENABLED: { available: false, reason: 'deployment_disabled' } } });
  }
  if (path === '/api/tstm/latest' && request.method === 'GET') return json({ error: 'This beta capability is unavailable during the D1 migration.' }, 503);
  if (path === '/api/sentry-tunnel' && request.method === 'POST') return handleSentryTunnel(request, env);
  if (path === '/api/billing/webhook' && request.method === 'POST') return handleStripeWebhook(request, env);
  return null;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const publicResponse = await handlePublicApi(request, env, path);
  if (publicResponse) return publicResponse;
  const identity = await authenticate(request, env);
  if (!identity) return json({ error: 'A verified Clerk session is required.' }, 401);

  const user = await ensureUserForRequest(identity, env);
  if (user instanceof Response) return user;
  return handleAuthenticatedApi(request, env, url, path, user);
}

async function ensureUserForRequest(identity, env) {
  try { return await ensureUser(identity, env); }
  catch (error) { return migrationErrorResponse(error); }
}

function migrationErrorResponse(error) {
  if (error?.code === 'SNAPSHOT_CONFIG_MISSING') return json({ error: 'Beta snapshot storage is temporarily unavailable.' }, 503);
  if (error?.message === 'EMAIL_ALREADY_LINKED') return json({ error: 'This email is already linked to another beta account.' }, 409);
  if (/^SNAPSHOT_(CYCLE|WORKFLOW|PRODUCT)_QUOTA_EXCEEDED$|^SNAPSHOT_MIGRATION_TOO_LARGE$/.test(error?.message || '')) {
    return json({ error: 'Your saved beta data exceeds the automatic migration limits. The Firestore snapshot is retained; contact support before retrying migration.' }, 409);
  }
  if (/^SNAPSHOT_/.test(error?.message || '')) return json({ error: 'Your saved beta data could not be migrated automatically. The Firestore snapshot is retained; contact support before retrying.' }, 409);
  console.error('[beta-worker] migration failed', error);
  return json({ error: 'Account data could not be migrated. Please retry later.' }, 503);
}

const JSON_RECORD_TABLES = new Set(['user_settings', 'user_entitlements', 'user_metrics']);
async function readJsonRecord(db, table, userId) {
  if (!JSON_RECORD_TABLES.has(table)) throw new Error('Invalid user data table.');
  const row = await db.prepare(`SELECT data_json FROM ${table} WHERE user_id = ?`).bind(userId).first();
  return row ? parseJson(row.data_json) : null;
}

async function flushStripeCleanupQueue(env) {
  if (!env.DB || !env.STRIPE_SECRET_KEY) return;
  const rows = await env.DB.prepare(`SELECT stripe_customer_id, attempts FROM billing_cleanup_queue
    WHERE next_attempt_at <= ? ORDER BY created_at LIMIT 50`).bind(new Date().toISOString()).all();
  const cleanCustomer = async (row) => {
    try {
      await stripeRequest(env, `customers/${encodeURIComponent(row.stripe_customer_id)}`, null, 'DELETE');
      await env.DB.prepare('DELETE FROM billing_cleanup_queue WHERE stripe_customer_id = ?').bind(row.stripe_customer_id).run();
    } catch (error) {
      if (error?.code === 'resource_missing') {
        await env.DB.prepare('DELETE FROM billing_cleanup_queue WHERE stripe_customer_id = ?').bind(row.stripe_customer_id).run();
        return;
      }
      console.error('[beta-worker] Stripe deletion will retry', row.stripe_customer_id);
      const retryDelayHours = Math.min(24, 2 ** Math.min(Number(row.attempts) || 0, 5));
      const nextAttemptAt = new Date(Date.now() + retryDelayHours * 60 * 60 * 1000).toISOString();
      await env.DB.prepare('UPDATE billing_cleanup_queue SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE stripe_customer_id = ?')
        .bind('Stripe customer deletion failed.', nextAttemptAt, row.stripe_customer_id).run();
    }
  };
  const pending = rows.results || [];
  for (let offset = 0; offset < pending.length; offset += 5) {
    await Promise.allSettled(pending.slice(offset, offset + 5).map(cleanCustomer));
  }
}

async function deleteBetaUserData(userId, env) {
  const entitlement = await readJsonRecord(env.DB, 'user_entitlements', userId);
  const statements = [];
  if (typeof entitlement?.stripeCustomerId === 'string' && entitlement.stripeCustomerId) {
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO billing_cleanup_queue (stripe_customer_id, created_at) VALUES (?, ?)')
      .bind(entitlement.stripeCustomerId, new Date().toISOString()));
  }
  statements.push(
    env.DB.prepare('DELETE FROM cloud_cycles WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM custom_products WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_records WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_entitlements WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_metrics WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM product_metric_events WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE clerk_id = ?').bind(userId),
  );
  await env.DB.batch(statements);
}

async function handleClerkWebhook(request, env) {
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET) return json({ error: 'Clerk webhook is not configured.' }, 503);
  let event;
  try { event = await verifyWebhook(request, { signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET }); }
  catch (error) {
    console.warn('[beta-worker] Clerk webhook signature rejected', error instanceof Error ? error.message : 'verification failed');
    return json({ error: 'Invalid Clerk webhook signature.' }, 400);
  }
  if (event.type === 'user.deleted') return handleClerkUserDeleted(event.data?.id, env);
  if (event.type === 'user.updated' && typeof event.data?.id === 'string') clearAuthProfileCache(event.data.id);
  return json({ received: true });
}

async function handleClerkUserDeleted(userId, env) {
  if (typeof userId !== 'string') return json({ received: true });
  clearAuthProfileCache(userId);
  if (!env.DB) return json({ error: 'Beta database is unavailable.' }, 503);
  try { await deleteBetaUserData(userId, env); }
  catch (error) {
    console.error('[beta-worker] Clerk deletion cleanup failed', error instanceof Error ? error.message : 'cleanup failed');
    return json({ error: 'Clerk account cleanup failed.' }, 500);
  }
  return json({ received: true });
}

function workerErrorResponse(error) {
  console.error('[beta-worker] request failed', error);
  if (error?.code === 'CLERK_PROFILE_UNAVAILABLE' || error?.code === 'CLERK_CONFIG_MISSING') return json({ error: 'Authentication service is temporarily unavailable. Retry shortly.' }, 503);
  if (/^SNAPSHOT_(CYCLE|WORKFLOW|PRODUCT)_QUOTA_EXCEEDED$|^SNAPSHOT_MIGRATION_TOO_LARGE$/.test(error?.message || '')) {
    return json({ error: 'Your saved beta data exceeds the automatic migration limits. The Firestore snapshot is retained; contact support before retrying migration.' }, 409);
  }
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return json({ error: 'The beta API request timed out while contacting a billing provider.' }, 504);
  return json({ error: 'The beta API request failed.' }, 500);
}

async function handleBetaApiRequest(request, env, url) {
  if (env.BETA_AUTH_BACKEND !== 'clerk-d1') return proxyFirebaseApi(request, url, env);
  if (url.pathname === '/api/webhooks/clerk' && request.method === 'POST') return handleClerkWebhook(request, env);
  try { return await handleApi(request, env); }
  catch (error) { return workerErrorResponse(error); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!(url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`))) return env.ASSETS.fetch(request);
    return handleBetaApiRequest(request, env, url);
  },
  async scheduled(_controller, env) {
    try { await flushStripeCleanupQueue(env); }
    catch (error) { console.error('[beta-worker] Stripe cleanup queue failed', error); }
    if (!env.DB) return;
    try {
      await env.DB.prepare("DELETE FROM product_metric_events WHERE event_date < date('now', '-90 days')").run();
      await env.DB.prepare("DELETE FROM stripe_events WHERE processed_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')").run();
    } catch (error) { console.error('[beta-worker] retention cleanup failed', error); }
  },
};

export const __test = { authenticate, emailSnapshotKey, deleteBetaUserData, clearAuthCache: () => authProfileCache.clear() };
