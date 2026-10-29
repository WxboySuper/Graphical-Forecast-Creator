import { createUserEnsurer, emailSnapshotKey } from './beta-user-migration.mjs';
import { MAX_CYCLE_BYTES, decodePathId, isObject, json, mapStripeInterval, parseJson, readLimitedBody, timingSafeStringEqual, verifyStripeSignature } from './beta-worker-utils.mjs';
import { proxyFirebaseApi } from './beta-worker-routing.mjs';
import { readAdminMetrics } from './beta-admin-metrics.mjs';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { authenticate, clearAuthProfileCache } from './beta-worker-auth.mjs';
import { handleHealthCheck, handleSentryTunnel } from './beta-worker-observability.mjs';

const API_PREFIX = '/api';
const MAX_CLOUD_CYCLES = 100;
const MAX_CUSTOM_PRODUCTS = 16;
const MAX_USER_RECORDS = 200;
const MAX_WORKFLOW_RECORDS = 200;
const MAX_LIST_PAGE_SIZE = 10;
// Keep this synchronized with the per-user/day limit in 0001_beta_auth_data.sql.
const MAX_PRODUCT_METRIC_DAILY_EVENTS = 500;
export { MAX_PRODUCT_METRIC_DAILY_EVENTS };
const DEFAULT_MONTHLY_DISPLAY_PRICE = '$3/month';
const DEFAULT_ANNUAL_DISPLAY_PRICE = '$30/year';
const PRODUCT_METRIC_EVENT_TYPES = new Set(['account_signup', 'account_signin', 'cycle_saved', 'discussion_saved', 'verification_run', 'cloud_cycle_saved', 'cloud_cycle_loaded']);

async function findMigratedStripeSubscription(env, entitlement) {
  if (typeof entitlement.stripeSubscriptionId === 'string' && entitlement.stripeSubscriptionId.startsWith('sub_')) {
    return stripeRequest(env, `subscriptions/${encodeURIComponent(entitlement.stripeSubscriptionId)}`, null, 'GET');
  }
  if (typeof entitlement.stripeCustomerId !== 'string' || !entitlement.stripeCustomerId.startsWith('cus_')) return null;
  const result = await stripeRequest(env, `subscriptions?customer=${encodeURIComponent(entitlement.stripeCustomerId)}&status=all&limit=100`, null, 'GET');
  const subscriptions = Array.isArray(result?.data) ? result.data : [];
  return subscriptions.find((item) => !entitlement.stripeSubscriptionId || item.id === entitlement.stripeSubscriptionId) || null;
}

function buildMigratedStripeEntitlement({ entitlement, attempted, userId, subscription, attemptedAt }) {
  const status = stripeStatus(subscription, 'inactive');
  const active = hasActiveStripeStatus(status);
  const betaOverrideActive = hasBetaOverride(entitlement);
  return {
    ...attempted, uid: userId, premiumActive: betaOverrideActive || active,
    billingStatus: status, stripeSubscriptionId: getSubscriptionId(subscription, entitlement.stripeSubscriptionId),
    cancelAtPeriodEnd: hasCancelAtPeriodEnd(subscription), currentPeriodEnd: stripePeriodEnd(subscription),
    planInterval: stripePlanInterval(subscription, entitlement.planInterval),
    effectiveSource: resolveEffectiveSource(betaOverrideActive, active),
    pendingStripeSync: false, stripeSyncAttemptAt: undefined, updatedAt: attemptedAt,
  };
}

const stripeStatus = (subscription, fallback) => subscription?.status || fallback;
const hasActiveStripeStatus = (status) => ['active', 'trialing'].includes(status);
const hasBetaOverride = (entitlement) => entitlement.betaOverrideActive === true;
function resolveEffectiveSource(overrideActive, active) {
  if (overrideActive) return 'beta_override';
  if (active) return 'stripe';
  return 'none';
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
    const updated = buildMigratedStripeEntitlement({ entitlement, attempted, userId, subscription, attemptedAt });
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
    ...createStripeRequestOptions(env, params, method),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw createStripeRequestError(body);
  return body;
}

const createStripeRequestOptions = (env, params, method) => ({
  method,
  headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  ...(params ? { body: new URLSearchParams(params) } : {}),
  signal: AbortSignal.timeout(8_000),
});

const createStripeRequestError = (body) => {
  const error = new Error(body?.error?.message || 'Stripe request failed.');
  error.code = body?.error?.code;
  error.stripeType = body?.error?.type;
  return error;
};

async function handleAuthenticatedApi(context) {
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
  if (path === '/api/me/bootstrap' && request.method === 'GET') return bootstrapAccount(env, user);
  if (path === '/api/billing/checkout' && request.method === 'POST') return startBillingCheckout(request, env, user);
  if (path === '/api/billing/portal' && request.method === 'POST') return openBillingPortal(env, user);
  if (path === '/api/beta/claim' && request.method === 'POST') return claimBetaAccess(request, env, user);
  return null;
}

async function bootstrapAccount(env, user) {
  return json({
    user: { id: user.clerk_id, email: user.email, displayName: user.display_name, betaAccess: Boolean(user.beta_access), migrationStatus: user.migration_status },
    settings: await readJsonRecord(env.DB, 'user_settings', user.clerk_id),
    entitlement: await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id),
    metrics: await readJsonRecord(env.DB, 'user_metrics', user.clerk_id),
  });
}

function getStripeUnavailableError(env) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Billing is not available on this deployment.' }, 503);
  return null;
}

function getCheckoutPrice(plan, env) {
  if (plan === 'monthly') return env.STRIPE_PRICE_MONTHLY || null;
  if (plan === 'annual') return env.STRIPE_PRICE_ANNUAL_STANDARD || null;
  return null;
}

async function createCheckoutSession(env, params) {
  try {
    return await stripeRequest(env, 'checkout/sessions', params);
  } catch {
    return null;
  }
}

function checkoutSessionResponse(session) {
  if (!session) return json({ error: 'Unable to start checkout with Stripe.' }, 502);
  if (typeof session.url !== 'string' || !session.url) return json({ error: 'Stripe checkout session did not include a URL.' }, 502);
  return json({ url: session.url });
}

async function startBillingCheckout(request, env, user) {
  const stripeUnavailable = getStripeUnavailableError(env);
  if (stripeUnavailable) return stripeUnavailable;
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const plan = body?.plan;
  const price = getCheckoutPrice(plan, env);
  if (!price) return json({ error: 'This billing plan is not available.' }, 400);
  if (!env.PUBLIC_ORIGIN) return json({ error: 'Billing is not configured.' }, 503);
  const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id) || {};
  const params = buildCheckoutParams({ env, user, plan, price, entitlement });
  const session = await createCheckoutSession(env, params);
  return checkoutSessionResponse(session);
}

function buildCheckoutParams({ env, user, plan, price, entitlement }) {
  return {
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1',
    success_url: `${env.PUBLIC_ORIGIN}/account?checkout=success`, cancel_url: `${env.PUBLIC_ORIGIN}/pricing?checkout=cancelled`,
    ...(!entitlement.stripeCustomerId ? { customer_email: user.email } : {}),
    client_reference_id: user.clerk_id,
    'metadata[clerkId]': user.clerk_id, 'metadata[legacyUid]': user.legacy_uid || '', 'metadata[plan]': plan,
    'subscription_data[metadata][clerkId]': user.clerk_id, 'subscription_data[metadata][legacyUid]': user.legacy_uid || '',
    'subscription_data[metadata][plan]': plan,
    ...(entitlement.stripeCustomerId ? { customer: entitlement.stripeCustomerId } : {}),
  };
}

async function openBillingPortal(env, user) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Billing is not available on this deployment.' }, 503);
  if (!env.PUBLIC_ORIGIN) return json({ error: 'Billing is not configured.' }, 503);
  const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
  if (!entitlement?.stripeCustomerId) return json({ error: 'No billing account is associated with this user.' }, 400);
  let portal;
  try { portal = await stripeRequest(env, 'billing_portal/sessions', { customer: entitlement.stripeCustomerId, return_url: `${env.PUBLIC_ORIGIN}/account` }); }
  catch { return json({ error: 'Unable to open the Stripe billing portal.' }, 502); }
  if (typeof portal?.url !== 'string' || !portal.url) return json({ error: 'Stripe billing portal session did not include a URL.' }, 502);
  return json({ url: portal.url });
}

function shouldClaimBetaAccess(user, env) {
  if (user.beta_access) return false;
  if (!env.BETA_INVITE_TOKEN) return false;
  return true;
}

async function isValidBetaInvite(body, env) {
  if (!body) return false;
  if (!(await timingSafeStringEqual(body.token, env.BETA_INVITE_TOKEN))) return false;
  if (env.BETA_INVITE_PATH && body.invitePath !== env.BETA_INVITE_PATH) return false;
  return true;
}

async function claimBetaAccess(request, env, user) {
  if (shouldClaimBetaAccess(user, env)) {
    const body = await readBody(request);
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    if (!(await isValidBetaInvite(body, env))) return json({ error: 'Invalid invite.' }, 403);
    await env.DB.prepare('UPDATE users SET beta_access = 1, updated_at = ? WHERE clerk_id = ?').bind(new Date().toISOString(), user.clerk_id).run();
  }
  const updated = await env.DB.prepare('SELECT beta_access FROM users WHERE clerk_id = ?').bind(user.clerk_id).first();
  return json({ betaAccess: Boolean(updated?.beta_access) });
}

async function handleAccountSettingsAndMetrics({ request, env, url, path, user }) {
  const context = { request, env, url, user };
  return ACCOUNT_SETTINGS_ROUTES[`${request.method} ${path}`]?.(context) ?? null;
}

const ACCOUNT_SETTINGS_ROUTES = {
  'GET /api/user/settings': ({ env, user }) => readAccountRecord(env, 'user_settings', 'settings', user),
  'PUT /api/user/settings': ({ request, env, user }) => saveUserSettings(request, env, user),
  'GET /api/user/entitlement': ({ env, user }) => readAccountRecord(env, 'user_entitlements', 'entitlement', user),
  'GET /api/user/metrics': ({ env, user }) => readAccountRecord(env, 'user_metrics', 'metrics', user),
  'GET /api/admin/metrics': ({ url, env, user }) => readAdminMetrics(url, env, user),
  'POST /api/metrics/event': ({ request, env, user }) => recordProductMetric(request, env, user),
};

async function readAccountRecord(env, table, key, user) {
  return json({ [key]: await readJsonRecord(env.DB, table, user.clerk_id) });
}

async function saveUserSettings(request, env, user) {
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

async function recordProductMetric(request, env, user) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const metric = parseProductMetric(body);
  if (metric.error) return metric.error;
  try {
    await env.DB.prepare(`INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), metric.eventDate, metric.installationId, metric.event, user.clerk_id).run();
  } catch (error) {
    if (String(error?.message || '').includes('product_metric_daily_quota_reached')) return json({ error: 'Daily metrics event limit reached.' }, 429);
    throw error;
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

function parseProductMetric(body) {
  const installationId = typeof body?.installationId === 'string' ? body.installationId : '';
  if (!PRODUCT_METRIC_EVENT_TYPES.has(body?.event)) return { error: json({ error: 'Invalid product metric event.' }, 400) };
  if (installationId.length < 8) return { error: json({ error: 'Invalid product metric event.' }, 400) };
  if (installationId.length > 128) return { error: json({ error: 'Invalid product metric event.' }, 400) };
  return { installationId, event: body.event, eventDate: new Date().toISOString().slice(0, 10) };
}

async function listCloudCycles(env, user, url) {
  const page = Number(url.searchParams.get('page') || 0);
  if (!Number.isSafeInteger(page) || page < 0) return json({ error: 'Invalid page.' }, 400);
  const result = await env.DB.prepare(`SELECT id, user_id AS userId, label, cycle_date AS cycleDate, metadata_json, created_at AS createdAt, updated_at AS updatedAt
    FROM cloud_cycles WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ${MAX_LIST_PAGE_SIZE} OFFSET ?`)
    .bind(user.clerk_id, page * MAX_LIST_PAGE_SIZE).all();
  const rows = result.results || [];
  return json({ cycles: rows.map((row) => {
    const stored = parseJson(row.metadata_json) || {};
    const metadata = { id: row.id, userId: row.userId, label: row.label, cycleDate: row.cycleDate,
      createdAt: row.createdAt, updatedAt: row.updatedAt, forecastDays: stored.forecastDays,
      totalOutlooks: stored.totalOutlooks, totalFeatures: stored.totalFeatures, isReadOnly: stored.isReadOnly,
      payloadHash: stored.payloadHash, workspaceId: stored.workspaceId, workflowMetadata: stored.workflowMetadata };
    return { id: row.id, userId: row.userId, label: row.label, cycleDate: row.cycleDate,
      createdAt: row.createdAt, updatedAt: row.updatedAt, workflowMetadata: stored.workflowMetadata, metadata };
  }), nextPage: rows.length === MAX_LIST_PAGE_SIZE ? page + 1 : null });
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
    const response = cloudCycleWriteError(error);
    if (response) return { response };
    throw error;
  }
}

function cloudCycleWriteError(error) {
  const message = String(error?.message || '');
  if (message.includes('cloud_cycle_quota_reached')) return json({ error: 'Cloud storage quota reached.' }, 409);
  if (message.includes('cloud_cycle_too_large') || message.includes('CHECK constraint failed')) return json({ error: 'Cloud cycle is too large.' }, 413);
  return null;
}

function parseCloudCycleInput(body) {
  if (body === BODY_TOO_LARGE) return { response: json({ error: 'Request body is too large.' }, 413) };
  const data = normalizeCloudCycleInput(body);
  if (!hasValidCloudCycleFields(data)) return invalidCloudCycleInput();
  if (!isJsonText(data.payloadJson)) return invalidCloudCycleInput();
  return { data };
}

function normalizeCloudCycleInput(body) {
  const payloadJson = typeof body?.payloadJson === 'string' ? body.payloadJson : '';
  return {
    id: normalizedString(body?.id), label: normalizedString(body?.label),
    cycleDate: typeof body?.cycleDate === 'string' ? body.cycleDate : '', payloadJson,
    bytes: new TextEncoder().encode(payloadJson).length, metadata: body?.metadata,
  };
}

function normalizedString(value) { return typeof value === 'string' ? value.trim() : ''; }

function hasValidCloudCycleFields(data) {
  return hasValidCloudCycleId(data.id) && hasValidCloudCycleLabel(data.label)
    && hasValidCloudCycleDate(data.cycleDate) && data.bytes <= MAX_CYCLE_BYTES && isObject(data.metadata);
}

function hasValidCloudCycleId(id) { return Boolean(id && id.length <= 128 && !id.includes('/')); }
function hasValidCloudCycleLabel(label) { return Boolean(label && label.length <= 200); }
function hasValidCloudCycleDate(cycleDate) { return Boolean(cycleDate && cycleDate.length <= 32); }
function isJsonText(value) { try { JSON.parse(value); return true; } catch { return false; } }
function invalidCloudCycleInput() { return { response: json({ error: 'Invalid cloud cycle payload.' }, 400) }; }

async function requirePremiumCloudStorage(env, user) {
  const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
  return entitlement?.premiumActive === true ? null : json({ error: 'Premium cloud storage is required.' }, 403);
}

async function cloudCycleSaveResult(env, user, id, saved) {
  if (saved.response) return saved.response;
  if (!saved.meta.changes) {
    const existing = await env.DB.prepare('SELECT 1 AS found FROM cloud_cycles WHERE user_id = ? AND id = ?').bind(user.clerk_id, id).first();
    if (!existing) return json({ error: 'Cloud storage quota reached.' }, 409);
  }
  return json({ success: true, data: id });
}

async function saveCloudCycle(request, env, user) {
  const input = parseCloudCycleInput(await readBody(request));
  if (input.response) return input.response;
  const accessError = await requirePremiumCloudStorage(env, user);
  if (accessError) return accessError;
  const saved = await writeCloudCycle(env, user, input.data);
  return cloudCycleSaveResult(env, user, input.data.id, saved);
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
  const { request, env, path, user, url } = context;
  if (path === '/api/cloud-cycles' && request.method === 'GET') return listCloudCycles(env, user, url);
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
  const input = parseWorkflowAwarenessInput(await readBody(request));
  if (input.response) return input.response;
  const { cycleId, dataJson } = input;
  const quotaResponse = await checkWorkflowAwarenessQuota(env, user.clerk_id, cycleId);
  if (quotaResponse) return quotaResponse;
  return persistWorkflowAwareness(env, user.clerk_id, cycleId, dataJson);
}

function parseWorkflowAwarenessInput(body) {
  if (body === BODY_TOO_LARGE) return { response: json({ error: 'Request body is too large.' }, 413) };
  const metadata = body?.record?.metadata;
  if (!isObject(metadata) || typeof metadata.cycleId !== 'string') return { response: json({ error: 'Invalid workflow record.' }, 400) };
  const cycleId = metadata.cycleId.trim();
  if (!cycleId || cycleId.includes('/')) return { response: json({ error: 'Invalid workflow record.' }, 400) };
  body.record.metadata.cycleId = cycleId;
  const dataJson = JSON.stringify(body.record);
  if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return { response: json({ error: 'Workflow record is too large.' }, 413) };
  return { cycleId, dataJson };
}

async function checkWorkflowAwarenessQuota(env, userId, cycleId) {
  const existingCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM workflow_awareness WHERE user_id = ? AND migration_import = 0').bind(userId).first();
  if (Number(existingCount?.count || 0) >= MAX_WORKFLOW_RECORDS) {
    const existing = await env.DB.prepare('SELECT 1 AS found FROM workflow_awareness WHERE user_id = ? AND cycle_id = ?')
      .bind(userId, cycleId).first();
    if (!existing) return json({ error: 'Workflow record quota reached.' }, 409);
  }
  return null;
}

async function persistWorkflowAwareness(env, userId, cycleId, dataJson) {
  try {
    await env.DB.prepare(`INSERT INTO workflow_awareness (user_id, cycle_id, data_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, cycle_id) DO UPDATE SET data_json = excluded.data_json`)
      .bind(userId, cycleId, dataJson).run();
  } catch (error) {
    if (String(error?.message || '').includes('workflow_awareness_quota_reached')) return json({ error: 'Workflow record quota reached.' }, 409);
    throw error;
  }
  return json({ success: true });
}

async function handleWorkflowDelete(env, path, user) {
  const awarenessMatch = path.match(/^\/api\/workflow-awareness\/([^/]+)$/);
  const cycleId = awarenessMatch ? decodePathId(awarenessMatch[1]) : null;
  if (hasInvalidWorkflowDeleteCycleId(awarenessMatch, cycleId)) return json({ error: 'Invalid cycle ID.' }, 400);
  const query = workflowDeleteQuery(env.DB, user.clerk_id, cycleId);
  await query.run();
  return json({ success: true });
}

function hasInvalidWorkflowDeleteCycleId(awarenessMatch, cycleId) {
  if (!awarenessMatch) return false;
  if (!cycleId) return true;
  return cycleId.includes('/');
}

function workflowDeleteQuery(db, userId, cycleId) {
  if (cycleId === null) return db.prepare('DELETE FROM workflow_awareness WHERE user_id = ?').bind(userId);
  return db.prepare('DELETE FROM workflow_awareness WHERE user_id = ? AND cycle_id = ?').bind(userId, cycleId);
}

async function handleWorkflowAwarenessRoutes(context) {
  const routes = {
    'GET /api/workflow-awareness': () => listWorkflowAwareness(context.env, context.url, context.user),
    'PUT /api/workflow-awareness': () => saveWorkflowAwareness(context.request, context.env, context.user),
    'DELETE /api/workflow-awareness': () => handleWorkflowDelete(context.env, context.path, context.user),
  };
  const match = context.path === '/api/workflow-awareness' || /^\/api\/workflow-awareness\/[^/]+$/.test(context.path);
  if (context.request.method === 'DELETE' && match) return routes['DELETE /api/workflow-awareness']();
  return routes[`${context.request.method} ${context.path}`]?.() ?? null;
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await insertCustomProductSlot(env, userId, product.id, dataJson);
    } catch (error) {
      const failure = await classifyCustomProductSlotFailure({ db: env.DB, error, userId, productId: product.id, attempt });
      if (failure) return failure;
    }
  }
}

async function insertCustomProductSlot(env, userId, productId, dataJson) {
  const slots = customProductSlotValues();
  const result = await env.DB.prepare(`WITH slots(slot_id) AS (VALUES ${slots})
    INSERT INTO custom_products (user_id, slot_id, product_id, data_json)
    SELECT ?, slots.slot_id, ?, ? FROM slots
    WHERE NOT EXISTS (SELECT 1 FROM custom_products WHERE user_id = ? AND slot_id = slots.slot_id)
      AND (SELECT COUNT(*) FROM custom_products WHERE user_id = ? AND migration_import = 0) < ?
    ORDER BY CASE WHEN slots.slot_id LIKE 'product-%' THEN 0 ELSE 1 END, slots.slot_id LIMIT 1`)
    .bind(userId, productId, dataJson, userId, userId, MAX_CUSTOM_PRODUCTS).run();
  return result.meta.changes ? null : json({ error: 'Custom product limit reached.' }, 409);
}

function customProductSlotValues() {
  return [...Array.from({ length: MAX_CUSTOM_PRODUCTS }, (_, index) => `('product-${String(index + 1).padStart(2, '0')}')`),
    ...Array.from({ length: MAX_CUSTOM_PRODUCTS }, (_, index) => `('active-${String(index + 1).padStart(2, '0')}')`)].join(', ');
}

async function classifyCustomProductSlotFailure({ db, error, userId, productId, attempt }) {
  const message = String(error?.message || '');
  if (message.includes('custom_product_quota_reached')) return json({ error: 'Custom product limit reached.' }, 409);
  if (!message.includes('UNIQUE constraint failed')) throw error;
  const duplicate = await db.prepare('SELECT 1 AS found FROM custom_products WHERE user_id = ? AND product_id = ?').bind(userId, productId).first();
  if (duplicate) return json({ error: 'Custom product already exists.' }, 409);
  return attempt ? json({ error: 'Custom product limit reached. Refresh and try again.' }, 409) : null;
}

async function createCustomProduct(request, env, user) {
  const input = parseNewCustomProduct(await readBody(request), user.clerk_id);
  if (input.response) return input.response;
  const failure = await reserveCustomProductSlot(env, user.clerk_id, input.product, input.dataJson);
  return failure || json({ success: true, product: input.product });
}

function parseNewCustomProduct(body, userId) {
  if (body === BODY_TOO_LARGE) return { response: json({ error: 'Request body is too large.' }, 413) };
  const product = body?.product;
  const result = normalizeNewCustomProduct(product, userId);
  if (result.response) return result;
  return hasValidPayloadSize(result.dataJson) ? result : oversizedCustomProduct();
}

function normalizeNewCustomProduct(product, userId) {
  const productId = typeof product?.id === 'string' ? product.id.trim() : '';
  if (!isObject(product)) return invalidCustomProduct();
  if (!isValidNewProductId(productId)) return invalidCustomProduct();
  if (!isNewProductOwner(product, userId)) return invalidCustomProduct();
  product.id = productId;
  return { product, dataJson: JSON.stringify(product) };
}

function invalidCustomProduct() { return { response: json({ error: 'Invalid custom product.' }, 400) }; }

function isValidNewProductId(id) { return Boolean(id && id.length <= 128 && !id.includes('/')); }
function isNewProductOwner(product, userId) { return product?.userId === userId && product?.version === 1 && product?.builtIn !== true; }
function hasValidPayloadSize(dataJson) { return new TextEncoder().encode(dataJson).length <= MAX_CYCLE_BYTES; }
function oversizedCustomProduct() { return { response: json({ error: 'Custom product is too large.' }, 413) }; }

async function patchCustomProduct({ request, env, user, productId, currentRow, current }) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const input = parseCustomProductPatch(body, productId, user.clerk_id, current.version);
  if (input.response) return input.response;
  const { product, dataJson } = input;
  const result = await env.DB.prepare(`UPDATE custom_products SET data_json = ? WHERE user_id = ? AND slot_id = ? AND product_id = ? AND json_extract(data_json, '$.version') = ?`)
    .bind(dataJson, user.clerk_id, currentRow.slot_id, productId, current.version).run();
  return result.meta.changes ? json({ success: true, product }) : json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
}

function parseCustomProductPatch(body, productId, userId, currentVersion) {
  const product = body?.product;
  if (!isObject(body)) return { response: json({ error: 'Invalid custom product.' }, 400) };
  if (!matchesProductIdentity(product, productId, userId) || !hasValidProductPatchVersion(product, body.expectedVersion)) {
    return { response: json({ error: 'Invalid custom product.' }, 400) };
  }
  if (!isCurrentProductVersion(product, body.expectedVersion, currentVersion)) return changedProductResponse();
  const dataJson = JSON.stringify(product);
  return hasValidPayloadSize(dataJson) ? { product, dataJson } : oversizedCustomProduct();
}

function matchesProductIdentity(product, productId, userId) {
  return isObject(product) && product.id === productId && product.userId === userId && product.builtIn !== true;
}

function hasValidProductPatchVersion(product, expectedVersion) {
  return Number.isInteger(expectedVersion) && Number.isInteger(product.version) && product.version === expectedVersion + 1;
}

function isCurrentProductVersion(product, expectedVersion, currentVersion) {
  return expectedVersion === currentVersion && product.version === currentVersion + 1;
}

function changedProductResponse() {
  return { response: json({ error: 'This product changed in another session. Refresh and try again.' }, 409) };
}

async function deleteCustomProduct({ request, env, user, productId, currentRow, current }) {
  const input = await readExpectedProductVersion(request, current.version);
  if (input.response) return input.response;
  const result = await env.DB.prepare(`DELETE FROM custom_products WHERE user_id = ? AND slot_id = ? AND product_id = ?
    AND json_extract(data_json, '$.version') = ?`).bind(user.clerk_id, currentRow.slot_id, productId, input.version).run();
  return result.meta.changes ? json({ success: true }) : json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
}

async function readExpectedProductVersion(request, currentVersion) {
  const ifMatch = request.headers.get('If-Match')?.trim() || '';
  const body = ifMatch ? null : await readBody(request);
  if (body === BODY_TOO_LARGE) return { response: json({ error: 'Request body is too large.' }, 413) };
  const version = versionFromIfMatch(ifMatch, body?.expectedVersion, currentVersion);
  if (!Number.isInteger(version) || version !== currentVersion) return { response: json({ error: 'This product changed in another session. Refresh and try again.' }, 409) };
  return { version };
}

function versionFromIfMatch(ifMatch, bodyVersion, currentVersion) {
  if (!ifMatch) return bodyVersion;
  if (ifMatch === '*') return currentVersion;
  const headerVersions = [...ifMatch.matchAll(/(?:^|,\s*)(?:W\/)?"?(\d+)"?(?=\s*(?:,|$))/g)].map((match) => Number(match[1]));
  return headerVersions.includes(currentVersion) ? currentVersion : NaN;
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
  const operation = { request, env, user, productId, currentRow, current };
  if (request.method === 'PATCH') return patchCustomProduct(operation);
  return deleteCustomProduct(operation);
}

async function handleCustomProductRoutes(context) {
  const { request, env, url, path, user } = context;
  if (path === '/api/custom-products' && request.method === 'GET') return listCustomProducts(env, url, user);
  if (path === '/api/custom-products' && request.method === 'POST') return createCustomProduct(request, env, user);
  return updateCustomProduct(context);
}

async function handleUserRecordRoutes({ request, env, url, path, user }) {
  const context = parseUserRecordContext({ request, env, url, path, user });
  if (!context) return null;
  if (context.error) return context.error;
  return dispatchUserRecordRoute(context);
}

function parseUserRecordContext({ request, env, url, path, user }) {
  const match = path.match(/^\/api\/(forecasts|discussions|verifications)(?:\/([^/]+))?$/);
  if (!match) return null;
  const recordType = { forecasts: 'forecast', discussions: 'discussion', verifications: 'verification' }[match[1]];
  const recordId = match[2] ? decodePathId(match[2]) : '';
  if (recordId === null || recordId.includes('/')) return { error: json({ error: 'Invalid record ID.' }, 400) };
  return { request, env, url, user, recordType, recordId };
}

async function dispatchUserRecordRoute(context) {
  const { request, recordId } = context;
  const operation = recordId ? { GET: readUserRecord, DELETE: deleteUserRecord }[request.method] : { GET: listUserRecords, PUT: saveUserRecord }[request.method];
  return operation ? operation(context) : null;
}

async function listUserRecords({ env, url, user, recordType }) {
  const page = Number(url.searchParams.get('page') || 0);
  if (!Number.isSafeInteger(page) || page < 0) return json({ error: 'Invalid page.' }, 400);
  const rows = await env.DB.prepare(`SELECT record_id, data_json, created_at, updated_at FROM user_records
    WHERE user_id = ? AND record_type = ? ORDER BY updated_at DESC, record_id DESC LIMIT ${MAX_LIST_PAGE_SIZE} OFFSET ?`)
    .bind(user.clerk_id, recordType, page * MAX_LIST_PAGE_SIZE).all();
  const results = rows.results || [];
  return json({ records: results.map((row) => ({ id: row.record_id, data: parseJson(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at })),
    nextPage: results.length === MAX_LIST_PAGE_SIZE ? page + 1 : null });
}

async function saveUserRecord({ request, env, user, recordType }) {
  const body = await readBody(request);
  if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
  const parsed = parseRecordWrite(body);
  if (parsed.error) return parsed.error;
  const { id, dataJson } = parsed;
  const now = new Date().toISOString();
  let result;
  try {
    result = await env.DB.prepare(`INSERT INTO user_records (user_id, record_type, record_id, data_json, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_records WHERE user_id = ? AND record_type = ? AND record_id = ?)
        OR (SELECT COUNT(*) FROM user_records WHERE user_id = ? AND record_type = ?) < ?
      ON CONFLICT(user_id, record_type, record_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
      .bind(user.clerk_id, recordType, id, dataJson, now, now, user.clerk_id, recordType, id, user.clerk_id, recordType, MAX_USER_RECORDS).run();
  } catch (error) {
    if (String(error?.message || '').includes('user_record_quota_reached')) return json({ error: 'Record quota reached.' }, 409);
    throw error;
  }
  if (!result.meta.changes) return json({ error: 'Record quota reached.' }, 409);
  return json({ success: true, id });
}

function parseRecordWrite(body) {
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id) return { error: json({ error: 'Invalid record.' }, 400) };
  if (id.length > 128) return { error: json({ error: 'Invalid record.' }, 400) };
  if (id.includes('/')) return { error: json({ error: 'Invalid record.' }, 400) };
  if (!isObject(body?.data)) return { error: json({ error: 'Invalid record.' }, 400) };
  const dataJson = JSON.stringify(body.data);
  if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return { error: json({ error: 'Record is too large.' }, 413) };
  return { id, dataJson };
}

async function readUserRecord({ env, user, recordType, recordId }) {
  const row = await env.DB.prepare('SELECT record_id, data_json, created_at, updated_at FROM user_records WHERE user_id = ? AND record_type = ? AND record_id = ?')
    .bind(user.clerk_id, recordType, recordId).first();
  return row ? json({ record: { id: row.record_id, data: parseJson(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at } }) : json({ error: 'Record not found.' }, 404);
}

async function deleteUserRecord({ env, user, recordType, recordId }) {
  await env.DB.prepare('DELETE FROM user_records WHERE user_id = ? AND record_type = ? AND record_id = ?')
    .bind(user.clerk_id, recordType, recordId).run();
  return json({ success: true });
}

async function claimStripeEvent(db, eventId) {
  const claim = await db.prepare('INSERT OR IGNORE INTO stripe_events (event_id, processed_at, status) VALUES (?, ?, ?)')
    .bind(eventId, new Date().toISOString(), 'processing').run();
  if (claim.meta.changes !== 0) return null;
  const prior = await db.prepare('SELECT status, processed_at FROM stripe_events WHERE event_id = ?').bind(eventId).first();
  return recoverStripeEventClaim(db, eventId, prior);
}

const stripeInProgressResponse = () => json({ received: false, error: 'Webhook delivery is already being processed.' }, 503);

async function recoverStripeEventClaim(db, eventId, prior) {
  if (prior?.status === 'completed') return json({ received: true, duplicate: true });
  const age = Date.now() - Date.parse(prior?.processed_at || '');
  if (prior?.status !== 'processing' || age <= 10 * 60 * 1000) return stripeInProgressResponse();
  const refreshed = await db.prepare(`UPDATE stripe_events SET processed_at = ? WHERE event_id = ? AND status = ? AND processed_at = ?`)
    .bind(new Date().toISOString(), eventId, 'processing', prior.processed_at).run();
  return refreshed.meta.changes ? null : stripeInProgressResponse();
}

async function lookupStripeOwner(db, query, value) {
  return value ? db.prepare(query).bind(value).first() : null;
}

async function resolveStripeOwner(db, metadata, object, subscription) {
  const clerkId = metadata.clerkId || object.client_reference_id || '';
  const legacyUid = metadata.legacyUid || '';
  const customerId = [subscription?.customer, object?.customer].find((value) => typeof value === 'string' && value) || '';
  const owner = await findStripeOwner(db, [
    ['SELECT clerk_id FROM users WHERE clerk_id = ?', clerkId],
    ['SELECT clerk_id FROM users WHERE legacy_uid = ?', legacyUid],
    [`SELECT user_id AS clerk_id FROM user_entitlements WHERE json_extract(data_json, '$.stripeCustomerId') = ?`, customerId],
  ]);
  return { owner, clerkId, legacyUid };
}

async function findStripeOwner(db, candidates) {
  for (const [query, value] of candidates) {
    const owner = await lookupStripeOwner(db, query, value);
    if (owner) return owner;
  }
  return null;
}

function buildStripeEntitlement({ ownerId, prior, subscription, object, eventType }) {
  const status = stripeStatus(subscription, checkoutFallbackStatus(eventType));
  const active = hasActiveStripeStatus(status);
  const betaOverrideActive = hasBetaOverride(prior);
  return {
    ...prior, uid: ownerId, stripeCustomerId: firstNonEmptyString(subscription?.customer, object?.customer, prior.stripeCustomerId),
    stripeSubscriptionId: getSubscriptionId(subscription, object?.subscription), billingStatus: status,
    premiumActive: betaOverrideActive || active, effectiveSource: resolveEffectiveSource(betaOverrideActive, active),
    cancelAtPeriodEnd: hasCancelAtPeriodEnd(subscription), currentPeriodEnd: stripePeriodEnd(subscription),
    planInterval: stripePlanInterval(subscription, prior.planInterval),
    updatedAt: new Date().toISOString(),
  };
}

function stripePeriodEnd(subscription) {
  const seconds = Number(subscription?.current_period_end);
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function hasCancelAtPeriodEnd(subscription) { return Boolean(subscription?.cancel_at_period_end); }
function getSubscriptionId(subscription, fallback) { return firstNonEmptyString(subscription?.id, fallback); }
function stripePlanInterval(subscription, fallback) { return mapStripeInterval(subscription) || fallback || null; }

function firstNonEmptyString(...values) {
  for (const value of values) if (typeof value === 'string' && value) return value;
  return null;
}

const checkoutFallbackStatus = (eventType) => eventType === 'checkout.session.completed' ? 'active' : 'inactive';
function stripeMetricTransition(wasActive, isActive) {
  if (!wasActive && isActive) return 'upgrades';
  if (wasActive && !isActive) return 'cancellations';
  return null;
}

async function saveStripeEntitlementBatch(db, statements, eventId, metricType) {
  try {
    await db.batch(statements);
  } catch (error) {
    if (!isStripeMetricQuotaError(error, metricType)) throw error;
    console.warn('[beta-worker] Stripe billing metric dropped by daily quota', eventId);
    await db.batch(statements.slice(0, 1));
  }
}

function isStripeMetricQuotaError(error, metricType) {
  if (!metricType) return false;
  return String(error?.message || '').includes('product_metric_daily_quota_reached');
}

async function writeStripeEntitlement(db, { event, ownerId, prior, subscription, object }) {
  const entitlement = buildStripeEntitlement({ ownerId, prior, subscription, object, eventType: event.type });
  const statements = [db.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
    .bind(ownerId, JSON.stringify(entitlement), entitlement.updatedAt)];
  const metricType = stripeMetricTransition(prior.premiumActive, entitlement.premiumActive);
  if (metricType) {
    statements.push(db.prepare('INSERT OR IGNORE INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id) VALUES (?, ?, ?, ?, ?)')
      .bind(`stripe:${event.id}:${metricType === 'upgrades' ? 'upgrade' : 'cancellation'}`, entitlement.updatedAt.slice(0, 10), event.id, metricType, ownerId));
  }
  await saveStripeEntitlementBatch(db, statements, event.id, metricType);
}

async function processStripeSubscriptionEvent(event, object, env) {
  const isCheckout = isCheckoutSubscriptionEvent(event, object);
  if (!isStripeSubscriptionEvent(event, isCheckout)) return null;
  const subscription = await readStripeSubscription(event, object, env, isCheckout);
  const identity = await resolveStripeOwner(env.DB, subscription.metadata || object.metadata || {}, object, subscription);
  if (identity.owner) {
    await updateStripeEntitlementForOwner({ event, owner: identity.owner, subscription, object, db: env.DB });
    return null;
  }
  return handleStripeOwnerNotFound(identity, env);
}

const isCheckoutSubscriptionEvent = (event, object) =>
  event.type === 'checkout.session.completed' && Boolean(object.subscription);

const isStripeSubscriptionEvent = (event, isCheckout) =>
  event.type.startsWith('customer.subscription.') || isCheckout;

const readStripeSubscription = (event, object, env, isCheckout) => {
  if (!isCheckout) return Promise.resolve(object);
  return stripeRequest(env, `subscriptions/${encodeURIComponent(object.subscription)}`, null, 'GET');
};

async function updateStripeEntitlementForOwner({ event, owner, subscription, object, db }) {
  const prior = await readJsonRecord(db, 'user_entitlements', owner.clerk_id) || {};
  await writeStripeEntitlement(db, { event, ownerId: owner.clerk_id, prior, subscription, object });
}

async function handleStripeOwnerNotFound(identity, env) {
  if (!identity.clerkId && !identity.legacyUid) return json({ received: true, ignored: 'missing-account-metadata' });
  const clerkResult = await readClerkStripeOwner(identity, env);
  if (clerkResult) return clerkResult;
  return json({ received: false, error: 'Billing user is not provisioned yet.' }, 503);
}

async function readClerkStripeOwner(identity, env) {
  if (!identity.clerkId || !env.CLERK_SECRET_KEY) return null;
  const clerkUser = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(identity.clerkId)}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }, signal: AbortSignal.timeout(3_000),
  });
  if (clerkUser.status === 404) return json({ received: true, ignored: 'deleted-account' });
  if (clerkUser.status === 429 || clerkUser.status >= 500) throw new Error('Clerk user lookup is temporarily unavailable.');
  if (!clerkUser.ok) return json({ received: false, error: 'Clerk user lookup failed.' }, 500);
  return null;
}

async function readStripeWebhookEvent(request, env) {
  if (!env.DB) return { response: json({ error: 'Beta database is unavailable.' }, 503) };
  if (!env.STRIPE_WEBHOOK_SECRET) return { response: json({ error: 'Billing webhook is not configured.' }, 503) };
  const rawBytes = await readLimitedBody(request, MAX_CYCLE_BYTES);
  if (rawBytes === null) return { response: json({ error: 'Webhook payload is too large.' }, 413) };
  const raw = new TextDecoder().decode(rawBytes);
  return parseVerifiedStripeEvent(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
}

async function parseVerifiedStripeEvent(raw, signature, secret) {
  const verified = await verifyStripeSignature(raw, signature, secret);
  if (!verified) return { response: json({ error: 'Invalid Stripe signature.' }, 400) };
  const event = parseStripeEvent(raw);
  if (!isValidStripeEvent(event)) {
    return { response: json({ error: 'Invalid webhook payload.' }, 400) };
  }
  return { event, object: event.data?.object || {} };
}

function isValidStripeEvent(event) {
  if (!isObject(event)) return false;
  if (typeof event.id !== 'string') return false;
  if (!event.id) return false;
  return typeof event.type === 'string';
}

const parseStripeEvent = (raw) => {
  try { return JSON.parse(raw); } catch { return null; }
};

async function handleStripeWebhook(request, env) {
  const parsed = await readStripeWebhookEvent(request, env);
  if (parsed.response) return parsed.response;
  const { event, object } = parsed;
  if (isUnconfiguredCheckoutSubscription(event, object, env)) {
    return json({ error: 'Billing is not configured.' }, 503);
  }
  const claimResponse = await claimStripeEvent(env.DB, event.id);
  if (claimResponse) return claimResponse;
  try {
    const response = await processStripeSubscriptionEvent(event, object, env);
    if (response) {
      if (response.status < 500) await env.DB.prepare('UPDATE stripe_events SET status = ?, processed_at = ? WHERE event_id = ?')
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

const isUnconfiguredCheckoutSubscription = (event, object, env) =>
  event.type === 'checkout.session.completed' && Boolean(object.subscription) && !env.STRIPE_SECRET_KEY;

const PUBLIC_API_ROUTES = {
  'GET /api/health': ({ env }) => handleHealthCheck(env),
  'GET /api/billing/config': ({ env }) => getBillingConfig(env),
  'GET /api/capabilities/status': () => json({ capabilities: { TSTM_GENERATION_ENABLED: { available: false, reason: 'deployment_disabled' } } }),
  'GET /api/tstm/latest': () => json({ error: 'This beta capability is unavailable during the D1 migration.' }, 503),
  'POST /api/sentry-tunnel': ({ request, env }) => handleSentryTunnel(request, env),
  'POST /api/billing/webhook': ({ request, env }) => handleStripeWebhook(request, env),
};

function getBillingConfig(env) {
  const checkoutEnabled = Boolean(env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_MONTHLY || env.STRIPE_PRICE_ANNUAL_STANDARD));
  return json({ billingEnabled: Boolean(env.STRIPE_SECRET_KEY), checkoutEnabled, annualPromoActive: false,
    monthlyDisplayPrice: env.MONTHLY_DISPLAY_PRICE || DEFAULT_MONTHLY_DISPLAY_PRICE,
    annualDisplayPrice: env.ANNUAL_DISPLAY_PRICE || DEFAULT_ANNUAL_DISPLAY_PRICE });
}

async function handlePublicApi(request, env, path) {
  return PUBLIC_API_ROUTES[`${request.method} ${path}`]?.({ request, env }) ?? null;
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
  return handleAuthenticatedApi({ request, env, url, path, user });
}

async function ensureUserForRequest(identity, env) {
  try { return await ensureUser(identity, env); }
  catch (error) { return migrationErrorResponse(error); }
}

function migrationErrorResponse(error) {
  const mapped = snapshotConfigurationError(error) || linkedEmailError(error) || snapshotQuotaError(error) || snapshotDataError(error);
  if (mapped) return mapped;
  console.error('[beta-worker] migration failed', error);
  return json({ error: 'Account data could not be migrated. Please retry later.' }, 503);
}

function snapshotConfigurationError(error) {
  return error?.code === 'SNAPSHOT_CONFIG_MISSING' ? json({ error: 'Beta snapshot storage is temporarily unavailable.' }, 503) : null;
}

function linkedEmailError(error) {
  return error?.message === 'EMAIL_ALREADY_LINKED' ? json({ error: 'This email is already linked to another beta account.' }, 409) : null;
}

function snapshotQuotaError(error) {
  const quotaExceeded = /^SNAPSHOT_(CYCLE|WORKFLOW|PRODUCT)_QUOTA_EXCEEDED$|^SNAPSHOT_MIGRATION_TOO_LARGE$/.test(error?.message || '');
  return quotaExceeded ? json({ error: 'Your saved beta data exceeds the automatic migration limits. The Firestore snapshot is retained; contact support before retrying migration.' }, 409) : null;
}

function snapshotDataError(error) {
  return /^SNAPSHOT_/.test(error?.message || '') ? json({ error: 'Your saved beta data could not be migrated automatically. The Firestore snapshot is retained; contact support before retrying.' }, 409) : null;
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
  return authenticationError(error) || snapshotQuotaError(error) || requestTimeoutError(error) || json({ error: 'The beta API request failed.' }, 500);
}

function authenticationError(error) {
  const unavailable = error?.code === 'CLERK_PROFILE_UNAVAILABLE' || error?.code === 'CLERK_CONFIG_MISSING';
  return unavailable ? json({ error: 'Authentication service is temporarily unavailable. Retry shortly.' }, 503) : null;
}

function requestTimeoutError(error) {
  const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError';
  return timedOut ? json({ error: 'The beta API request timed out while contacting a billing provider.' }, 504) : null;
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

export const __test = { authenticate, emailSnapshotKey, deleteBetaUserData, clearAuthCache: () => clearAuthProfileCache() };
