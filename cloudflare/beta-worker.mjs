import { verifyToken } from '@clerk/backend';
import { verifyWebhook } from '@clerk/backend/webhooks';

const API_PREFIX = '/api';
const MAX_CYCLE_BYTES = 750_000;
const MAX_CLOUD_CYCLES = 100;
const MAX_CUSTOM_PRODUCTS = 16;
const MAX_SENTRY_ENVELOPE_BYTES = 100 * 1024;
const AUTH_PROFILE_CACHE_TTL_MS = 30_000;
const AUTH_PROFILE_CACHE_MAX = 1_000;
const DEFAULT_MONTHLY_DISPLAY_PRICE = '$3/month';
const DEFAULT_ANNUAL_DISPLAY_PRICE = '$30/year';
const authProfileCache = new Map();
const PRODUCT_METRIC_EVENT_TYPES = new Set(['account_signup', 'account_signin', 'cycle_saved', 'discussion_saved', 'verification_run', 'cloud_cycle_saved', 'cloud_cycle_loaded']);

const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});

const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const decodePathId = (value) => {
  try { return decodeURIComponent(value); } catch { return null; }
};
const readBearer = (request) => {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};

async function authenticate(request, env) {
  const token = readBearer(request);
  if (!token || !env.CLERK_JWT_KEY || !env.CLERK_SECRET_KEY) { console.warn('[beta-worker] missing token or Clerk verification key', Boolean(token), Boolean(env.CLERK_JWT_KEY)); return null; }
  try {
    const configuredParties = env.CLERK_AUTHORIZED_PARTIES || env.PUBLIC_ORIGIN || '';
    const parties = configuredParties
      .split(',').map((party) => party.trim()).filter(Boolean);
    if (parties.length === 0) return null;
    const verified = await verifyToken(token, {
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: parties,
    });
    const data = verified?.data || verified;
    const errors = verified?.errors;
    if (errors?.length || !data?.sub) {
      if (errors?.length) console.warn('[beta-worker] Clerk token rejected', errors.map((error) => error.message).join('; '));
      return null;
    }
    const cached = authProfileCache.get(data.sub);
    if (cached && cached.expiresAt > Date.now()) return cached.identity;
    if (cached) authProfileCache.delete(data.sub);
    if (authProfileCache.size >= AUTH_PROFILE_CACHE_MAX) {
      const oldestKey = authProfileCache.keys().next().value;
      if (oldestKey) authProfileCache.delete(oldestKey);
    }
    let profileResponse;
    try {
      profileResponse = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(data.sub)}`, {
        headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
        signal: AbortSignal.timeout(3_000),
      });
    } catch (error) {
      const unavailable = new Error('Clerk profile service is temporarily unavailable.');
      unavailable.code = 'CLERK_PROFILE_UNAVAILABLE';
      unavailable.cause = error;
      throw unavailable;
    }
    if (profileResponse.status === 429 || profileResponse.status >= 500) {
      const unavailable = new Error('Clerk profile service is temporarily unavailable.');
      unavailable.code = 'CLERK_PROFILE_UNAVAILABLE';
      throw unavailable;
    }
    if (!profileResponse.ok) { console.warn('[beta-worker] Clerk profile response rejected', profileResponse.status); return null; }
    const profile = await profileResponse.json();
    const primary = Array.isArray(profile.email_addresses)
      ? profile.email_addresses.find((entry) => entry.id === profile.primary_email_address_id)
      : null;
    const email = normalizeEmail(primary?.email_address);
    if (!email || primary?.verification?.status !== 'verified') { console.warn('[beta-worker] Clerk primary email is not verified', Boolean(email), primary?.verification?.status); return null; }
    const displayName = [profile.first_name, profile.last_name].filter((part) => typeof part === 'string' && part).join(' ');
    const identity = { clerkId: data.sub, email, displayName };
    const now = Date.now();
    authProfileCache.set(data.sub, { identity, expiresAt: now + AUTH_PROFILE_CACHE_TTL_MS });
    return identity;
  } catch (error) {
    if (error?.code === 'CLERK_PROFILE_UNAVAILABLE') throw error;
    console.warn('[beta-worker] Clerk token rejected', error instanceof Error ? error.message : 'verification failed');
    return null;
  }
}

const emailSnapshotKey = async (email) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeEmail(email)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `by-email/${hex}.json`;
};

async function ensureUser(user, env) {
  let existing = await env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(user.clerkId).first();
  const emailOwner = await env.DB.prepare('SELECT clerk_id FROM users WHERE email = ?').bind(user.email).first();
  if (emailOwner && emailOwner.clerk_id !== user.clerkId) throw new Error('EMAIL_ALREADY_LINKED');
  if (existing) {
    if (normalizeEmail(existing.email) !== user.email || (existing.display_name || '') !== (user.displayName || '')) {
      try {
        await env.DB.prepare('UPDATE users SET email = ?, email_verified = 1, display_name = ?, updated_at = ? WHERE clerk_id = ?')
          .bind(user.email, user.displayName, new Date().toISOString(), user.clerkId).run();
      } catch (error) {
        if (String(error?.message || '').includes('UNIQUE constraint failed: users.email')) throw new Error('EMAIL_ALREADY_LINKED');
        throw error;
      }
    }
    if (existing.migration_status === 'complete') {
      return await env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(user.clerkId).first();
    }
  }

  let snapshot = null;
  if (env.FIRESTORE_SNAPSHOT) {
    const object = await env.FIRESTORE_SNAPSHOT.get(await emailSnapshotKey(user.email));
    if (object) {
      try { snapshot = await object.json(); } catch { throw new Error('SNAPSHOT_INVALID'); }
    }
  }

  const now = new Date().toISOString();
  const migrationStatus = snapshot ? 'migrating' : 'no_match';
  if (!existing) {
    try {
      await env.DB.prepare(`INSERT INTO users (clerk_id, email, legacy_uid, email_verified, display_name, beta_access,
        migration_status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`)
        .bind(user.clerkId, user.email, snapshot?.uid || null, user.displayName, snapshot?.userProfile?.betaAccess === true ? 1 : 0,
          migrationStatus, now, now).run();
    } catch (error) {
      const racedUser = await env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(user.clerkId).first();
      if (!racedUser) {
        const racedEmail = await env.DB.prepare('SELECT clerk_id FROM users WHERE email = ?').bind(user.email).first();
        if (racedEmail && racedEmail.clerk_id !== user.clerkId) throw new Error('EMAIL_ALREADY_LINKED');
        throw error;
      }
      existing = racedUser;
    }
  } else {
    await env.DB.prepare(`UPDATE users SET migration_status = ?, legacy_uid = COALESCE(legacy_uid, ?),
      beta_access = CASE WHEN ? = 1 THEN 1 ELSE beta_access END, updated_at = ? WHERE clerk_id = ?`)
      .bind(migrationStatus, snapshot?.uid || null, snapshot?.userProfile?.betaAccess === true ? 1 : 0, now, user.clerkId).run();
  }

  if (snapshot) {
    try {
      const statements = [];
      const settings = snapshot.userSettings;
      if (settings) {
        const settingsWithoutLegacyCycles = { ...settings };
        delete settingsWithoutLegacyCycles.cloudCycles;
        // Snapshot values seed missing keys; current D1 values win on collisions.
        statements.push(env.DB.prepare(`INSERT INTO user_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_settings.data_json), updated_at = excluded.updated_at`)
          .bind(user.clerkId, JSON.stringify(settingsWithoutLegacyCycles), now));
      }
      const entitlement = snapshot.userEntitlement;
      if (entitlement) statements.push(env.DB.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_entitlements.data_json), updated_at = excluded.updated_at`)
        .bind(user.clerkId, JSON.stringify({ ...entitlement, uid: user.clerkId }), now));
      const metrics = snapshot.userMetrics;
      if (metrics) statements.push(env.DB.prepare(`INSERT INTO user_metrics (user_id, data_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_metrics.data_json), updated_at = excluded.updated_at`)
        .bind(user.clerkId, JSON.stringify({ ...metrics, uid: user.clerkId }), now));
      for (const cycle of snapshot.cloudCycles || []) {
        if (typeof cycle.id !== 'string' || !cycle.id || cycle.id.length > 128 || cycle.id.includes('/')) throw new Error('SNAPSHOT_CYCLE_ID_INVALID');
        const payloadJson = typeof cycle.payloadJson === 'string' && cycle.payloadJson ? cycle.payloadJson : '{}';
        const payloadBytes = new TextEncoder().encode(payloadJson).length;
        if (payloadBytes > MAX_CYCLE_BYTES) throw new Error('SNAPSHOT_CYCLE_TOO_LARGE');
        try { JSON.parse(payloadJson); } catch { throw new Error('SNAPSHOT_CYCLE_INVALID'); }
        statements.push(env.DB.prepare(`INSERT OR IGNORE INTO cloud_cycles
          (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(cycle.id, user.clerkId, cycle.label || '', cycle.cycleDate || '', JSON.stringify({ ...(cycle.metadata || {}), userId: user.clerkId }),
            payloadJson, payloadBytes,
            cycle.createdAt || now, cycle.updatedAt || now));
      }
      for (const record of snapshot.workflowAwareness || []) {
        if (typeof record.id !== 'string' || !record.id || record.id.includes('/')) throw new Error('SNAPSHOT_WORKFLOW_ID_INVALID');
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO workflow_awareness (user_id, cycle_id, data_json) VALUES (?, ?, ?)')
          .bind(user.clerkId, record.id, JSON.stringify(record.data)));
      }
      for (const [index, product] of (snapshot.customProducts || []).entries()) {
        const migratedProduct = { ...(product.data || {}), userId: user.clerkId };
        const productId = typeof migratedProduct.id === 'string' && migratedProduct.id ? migratedProduct.id : product.id;
        if (typeof productId !== 'string' || !productId || productId.length > 128 || productId.includes('/')) throw new Error('SNAPSHOT_PRODUCT_ID_INVALID');
        migratedProduct.id = productId;
        const slotId = index < MAX_CUSTOM_PRODUCTS ? `product-${String(index + 1).padStart(2, '0')}` : `legacy-${index + 1}`;
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO custom_products (user_id, slot_id, product_id, data_json) VALUES (?, ?, ?, ?)')
          .bind(user.clerkId, slotId, productId, JSON.stringify(migratedProduct)));
      }
      statements.push(env.DB.prepare('UPDATE users SET migration_status = ?, migrated_at = ?, updated_at = ? WHERE clerk_id = ?')
        .bind('complete', now, now, user.clerkId));
      for (let offset = 0; offset < statements.length; offset += 50) {
        await env.DB.batch(statements.slice(offset, offset + 50));
      }
    } catch (error) {
      await env.DB.prepare('UPDATE users SET migration_status = ?, updated_at = ? WHERE clerk_id = ?')
        .bind('failed', new Date().toISOString(), user.clerkId).run();
      throw error;
    }
  }

  return await env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(user.clerkId).first();
}

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

async function verifyStripeSignature(payload, header, secret) {
  const parts = (header || '').split(',').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim().replace(/^"|"$/g, '')];
  });
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key, value]) => key === 'v1' && value).map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const valid = signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    return difference === 0;
  });
  return valid && Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/api/health' && request.method === 'GET') {
    if (!env.DB) return json({ status: 'ok', service: 'gfc-beta-worker', database: false }, 503);
    try {
      await env.DB.prepare(`SELECT (SELECT 1 FROM users LIMIT 1) AS users,
        (SELECT 1 FROM user_settings LIMIT 1) AS settings, (SELECT 1 FROM user_entitlements LIMIT 1) AS entitlements,
        (SELECT 1 FROM user_metrics LIMIT 1) AS metrics, (SELECT 1 FROM cloud_cycles LIMIT 1) AS cloud_cycles,
        (SELECT 1 FROM workflow_awareness LIMIT 1) AS awareness, (SELECT 1 FROM custom_products LIMIT 1) AS products,
        (SELECT 1 FROM user_records LIMIT 1) AS records, (SELECT 1 FROM stripe_events LIMIT 1) AS stripe_events`).first();
      return json({ status: 'ok', service: 'gfc-beta-worker', database: true });
    } catch {
      return json({ status: 'ok', service: 'gfc-beta-worker', database: false }, 503);
    }
  }
  if (path === '/api/billing/config' && request.method === 'GET') {
    const checkoutEnabled = Boolean(env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_MONTHLY || env.STRIPE_PRICE_ANNUAL_STANDARD));
    return json({ billingEnabled: Boolean(env.STRIPE_SECRET_KEY), checkoutEnabled, annualPromoActive: false,
      monthlyDisplayPrice: env.MONTHLY_DISPLAY_PRICE || DEFAULT_MONTHLY_DISPLAY_PRICE,
      annualDisplayPrice: env.ANNUAL_DISPLAY_PRICE || DEFAULT_ANNUAL_DISPLAY_PRICE });
  }
  if (path === '/api/capabilities/status' && request.method === 'GET') {
    return json({ capabilities: { TSTM_GENERATION_ENABLED: { available: false, reason: 'deployment_disabled' } } });
  }
  if (path === '/api/tstm/latest' && request.method === 'GET') {
    return json({ error: 'This beta capability is unavailable during the D1 migration.' }, 503);
  }
  if (path === '/api/sentry-tunnel' && request.method === 'POST') {
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
  if (path === '/api/billing/webhook' && request.method === 'POST') {
    if (!env.DB) return json({ error: 'Beta database is unavailable.' }, 503);
    if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Billing webhook is not configured.' }, 503);
    const rawBytes = await readLimitedBody(request, MAX_CYCLE_BYTES);
    if (rawBytes === null) return json({ error: 'Webhook payload is too large.' }, 413);
    const raw = new TextDecoder().decode(rawBytes);
    if (!(await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'Invalid Stripe signature.' }, 400);
    let event;
    try { event = JSON.parse(raw); } catch { return json({ error: 'Invalid webhook payload.' }, 400); }
    if (typeof event?.id !== 'string' || !event.id || typeof event.type !== 'string') return json({ error: 'Invalid webhook payload.' }, 400);
    const object = event.data?.object || {};
    if (event.type === 'checkout.session.completed' && object.subscription && !env.STRIPE_SECRET_KEY) {
      return json({ error: 'Billing is not configured.' }, 503);
    }
    const claim = await env.DB.prepare('INSERT OR IGNORE INTO stripe_events (event_id, processed_at, status) VALUES (?, ?, ?)')
      .bind(event.id, new Date().toISOString(), 'processing').run();
    if (claim.meta.changes === 0) {
      const priorEvent = await env.DB.prepare('SELECT status FROM stripe_events WHERE event_id = ?').bind(event.id).first();
      return priorEvent?.status === 'completed'
        ? json({ received: true, duplicate: true })
        : json({ received: false, error: 'Webhook delivery is already being processed.' }, 503);
    }
    try {
    let subscription = object;
    if (event.type === 'checkout.session.completed' && object.subscription) subscription = await stripeRequest(env, `subscriptions/${encodeURIComponent(object.subscription)}`, null, 'GET');
    if (event.type.startsWith('customer.subscription.') || (event.type === 'checkout.session.completed' && object.subscription)) {
      const metadata = subscription.metadata || object.metadata || {};
      const clerkId = metadata.clerkId || object.client_reference_id || '';
      const legacyUid = metadata.legacyUid || '';
      const owner = clerkId
        ? await env.DB.prepare('SELECT clerk_id FROM users WHERE clerk_id = ?').bind(clerkId).first()
        : legacyUid ? await env.DB.prepare('SELECT clerk_id FROM users WHERE legacy_uid = ?').bind(legacyUid).first() : null;
      if (owner) {
        const prior = await readJsonRecord(env.DB, 'user_entitlements', owner.clerk_id) || {};
        const status = subscription.status || (event.type === 'checkout.session.completed' ? 'active' : 'inactive');
        const periodEnd = Number(subscription.current_period_end) ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null;
        const active = ['active', 'trialing'].includes(status);
        const entitlement = { ...prior, uid: owner.clerk_id, stripeCustomerId: subscription.customer || object.customer || prior.stripeCustomerId || null,
          stripeSubscriptionId: subscription.id || object.subscription || null, billingStatus: status,
          premiumActive: prior.betaOverrideActive === true || active,
          effectiveSource: prior.betaOverrideActive === true ? 'beta_override' : active ? 'stripe' : 'none',
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), currentPeriodEnd: periodEnd,
          planInterval: subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly', updatedAt: new Date().toISOString() };
        const billingStatements = [env.DB.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
          .bind(owner.clerk_id, JSON.stringify(entitlement), entitlement.updatedAt)];
        const eventDate = entitlement.updatedAt.slice(0, 10);
        if (!prior.premiumActive && active) {
          billingStatements.push(env.DB.prepare('INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id) VALUES (?, ?, ?, ?, ?)')
            .bind(event.id, eventDate, event.id, 'upgrades', owner.clerk_id));
        } else if (prior.premiumActive && !active) {
          billingStatements.push(env.DB.prepare('INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id) VALUES (?, ?, ?, ?, ?)')
            .bind(event.id, eventDate, event.id, 'cancellations', owner.clerk_id));
        }
        await env.DB.batch(billingStatements);
      } else {
        await env.DB.prepare('DELETE FROM stripe_events WHERE event_id = ?').bind(event.id).run();
        return json({ received: false, error: 'Billing user is not provisioned yet.' }, 503);
      }
    }
    await env.DB.prepare('UPDATE stripe_events SET status = ?, processed_at = ? WHERE event_id = ?')
      .bind('completed', new Date().toISOString(), event.id).run();
    return json({ received: true });
    } catch (error) {
      await env.DB.prepare('DELETE FROM stripe_events WHERE event_id = ?').bind(event.id).run();
      throw error;
    }
  }
  if (!env.DB) return json({ error: 'Beta database is unavailable.' }, 503);

  const identity = await authenticate(request, env);
  if (!identity) return json({ error: 'A verified Clerk session is required.' }, 401);

  let user;
  try { user = await ensureUser(identity, env); }
  catch (error) {
    if (error?.message === 'EMAIL_ALREADY_LINKED') return json({ error: 'This email is already linked to another beta account.' }, 409);
    if (error?.message === 'SNAPSHOT_INVALID') return json({ error: 'Account migration data is temporarily unavailable.' }, 503);
    console.error('[beta-worker] migration failed', error);
    return json({ error: 'Account data could not be migrated. Please retry later.' }, 503);
  }

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
    const price = plan === 'monthly' ? env.STRIPE_PRICE_MONTHLY : plan === 'annual' ? env.STRIPE_PRICE_ANNUAL_STANDARD : null;
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
    const session = await stripeRequest(env, 'checkout/sessions', params);
    return json({ url: session.url });
  }

  if (path === '/api/billing/portal' && request.method === 'POST') {
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Billing is not available on this deployment.' }, 503);
    if (!env.PUBLIC_ORIGIN) return json({ error: 'Billing is not configured.' }, 503);
    const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
    if (!entitlement?.stripeCustomerId) return json({ error: 'No billing account is associated with this user.' }, 400);
    const portal = await stripeRequest(env, 'billing_portal/sessions', {
      customer: entitlement.stripeCustomerId,
      return_url: `${env.PUBLIC_ORIGIN}/account`,
    });
    return json({ url: portal.url });
  }

  if (path === '/api/beta/claim' && request.method === 'POST') {
    if (!user.beta_access && env.BETA_INVITE_TOKEN) {
      const body = await readBody(request);
      if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
      if (!body || body.token !== env.BETA_INVITE_TOKEN || (env.BETA_INVITE_PATH && body.invitePath !== env.BETA_INVITE_PATH)) return json({ error: 'Invalid invite.' }, 403);
      await env.DB.prepare('UPDATE users SET beta_access = 1, updated_at = ? WHERE clerk_id = ?').bind(new Date().toISOString(), user.clerk_id).run();
    }
    const updated = await env.DB.prepare('SELECT beta_access FROM users WHERE clerk_id = ?').bind(user.clerk_id).first();
    return json({ betaAccess: Boolean(updated?.beta_access) });
  }

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
    const allowed = (env.ADMIN_CLERK_ID_ALLOWLIST || env.ADMIN_UID_ALLOWLIST || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!allowed.includes(user.clerk_id) && !(user.legacy_uid && allowed.includes(user.legacy_uid))) return json({ error: 'Admin access denied.' }, 403);
    const days = url.searchParams.get('window') === '30' ? 30 : url.searchParams.get('window') === '7' ? 7 : null;
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
    await env.DB.prepare(`INSERT INTO product_metric_events (event_id, event_date, installation_id, event_type, user_id)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), eventDate, installationId, body.event, user.clerk_id).run();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  if (path === '/api/cloud-cycles' && request.method === 'GET') {
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
  if (path === '/api/cloud-cycles' && request.method === 'POST') {
    const body = await readBody(request);
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    const cycleDate = typeof body?.cycleDate === 'string' ? body.cycleDate : '';
    const payloadJson = typeof body?.payloadJson === 'string' ? body.payloadJson : '';
    const bytes = new TextEncoder().encode(payloadJson).length;
    if (!id || id.length > 128 || id.includes('/') || !label || label.length > 200 || !cycleDate || cycleDate.length > 32 || bytes > MAX_CYCLE_BYTES || !isObject(body?.metadata)) return json({ error: 'Invalid cloud cycle payload.' }, 400);
    try { JSON.parse(payloadJson); } catch { return json({ error: 'Invalid cloud cycle payload.' }, 400); }
    const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
    if (entitlement?.premiumActive !== true) return json({ error: 'Premium cloud storage is required.' }, 403);
    const now = new Date().toISOString();
    const saveResult = await env.DB.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM cloud_cycles WHERE user_id = ? AND id = ?)
        OR (SELECT COUNT(*) FROM cloud_cycles WHERE user_id = ?) < ?
      ON CONFLICT(user_id, id) DO UPDATE SET label = excluded.label, cycle_date = excluded.cycle_date,
        metadata_json = json_set(excluded.metadata_json, '$.createdAt', COALESCE(json_extract(cloud_cycles.metadata_json, '$.createdAt'), json_extract(excluded.metadata_json, '$.createdAt'))),
        payload_json = excluded.payload_json,
        payload_bytes = excluded.payload_bytes, updated_at = excluded.updated_at`)
      .bind(id, user.clerk_id, label, cycleDate, JSON.stringify({ ...body.metadata, userId: user.clerk_id }), payloadJson, bytes, now, now,
        user.clerk_id, id, user.clerk_id, MAX_CLOUD_CYCLES).run();
    if (!saveResult.meta.changes) {
      const existing = await env.DB.prepare('SELECT 1 AS found FROM cloud_cycles WHERE user_id = ? AND id = ?')
        .bind(user.clerk_id, id).first();
      if (!existing) return json({ error: 'Cloud storage quota reached.' }, 409);
    }
    return json({ success: true, data: id });
  }
  const cycleMatch = path.match(/^\/api\/cloud-cycles\/([^/]+)$/);
  if (cycleMatch) {
    const id = decodePathId(cycleMatch[1]);
    if (!id || id.includes('/')) return json({ error: 'Invalid cloud cycle ID.' }, 400);
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM cloud_cycles WHERE id = ? AND user_id = ?').bind(id, user.clerk_id).first();
      if (!row) return json({ error: 'Cloud cycle not found.' }, 404);
      return json({ cycle: { id: row.id, userId: row.user_id, label: row.label, cycleDate: row.cycle_date,
        createdAt: row.created_at, updatedAt: row.updated_at, metadata: parseJson(row.metadata_json), payload: parseJson(row.payload_json) } });
    }
    if (request.method === 'PATCH') {
      const body = await readBody(request);
      if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
      if (typeof body?.label !== 'string' || !body.label.trim() || body.label.length > 200) return json({ error: 'Invalid label.' }, 400);
      const updatedAt = new Date().toISOString();
      const result = await env.DB.prepare(`UPDATE cloud_cycles SET label = ?, updated_at = ?,
        metadata_json = json_set(metadata_json, '$.label', ?, '$.updatedAt', ?) WHERE id = ? AND user_id = ?`)
        .bind(body.label.trim(), updatedAt, body.label.trim(), updatedAt, id, user.clerk_id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: 'Cloud cycle not found.' }, 404);
    }
    if (request.method === 'DELETE') {
      const result = await env.DB.prepare('DELETE FROM cloud_cycles WHERE id = ? AND user_id = ?').bind(id, user.clerk_id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: 'Cloud cycle not found.' }, 404);
    }
  }

  if (path === '/api/workflow-awareness' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT cycle_id AS id, data_json FROM workflow_awareness WHERE user_id = ?')
      .bind(user.clerk_id).all();
    return json({ records: (result.results || []).map((row) => parseJson(row.data_json)).filter(Boolean) });
  }
  if (path === '/api/workflow-awareness' && request.method === 'PUT') {
    const body = await readBody(request);
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    if (!isObject(body?.record?.metadata) || typeof body.record.metadata.cycleId !== 'string') return json({ error: 'Invalid workflow record.' }, 400);
    const cycleId = body.record.metadata.cycleId.trim();
    if (!cycleId || cycleId.includes('/')) return json({ error: 'Invalid workflow record.' }, 400);
    body.record.metadata.cycleId = cycleId;
    const dataJson = JSON.stringify(body.record);
    if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Workflow record is too large.' }, 413);
    await env.DB.prepare(`INSERT INTO workflow_awareness (user_id, cycle_id, data_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, cycle_id) DO UPDATE SET data_json = excluded.data_json`)
      .bind(user.clerk_id, cycleId, dataJson).run();
    return json({ success: true });
  }
  if (path === '/api/workflow-awareness' && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ?').bind(user.clerk_id).run();
    return json({ success: true });
  }
  const awarenessMatch = path.match(/^\/api\/workflow-awareness\/([^/]+)$/);
  if (awarenessMatch && request.method === 'DELETE') {
    const cycleId = decodePathId(awarenessMatch[1]);
    if (!cycleId || cycleId.includes('/')) return json({ error: 'Invalid cycle ID.' }, 400);
    await env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ? AND cycle_id = ?')
      .bind(user.clerk_id, cycleId).run();
    return json({ success: true });
  }

  if (path === '/api/custom-products' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT data_json FROM custom_products WHERE user_id = ? ORDER BY slot_id')
      .bind(user.clerk_id).all();
    return json({ products: (result.results || []).map((row) => parseJson(row.data_json)) });
  }
  if (path === '/api/custom-products' && request.method === 'POST') {
    const body = await readBody(request);
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    const product = body?.product;
    const productId = typeof product?.id === 'string' ? product.id.trim() : '';
    if (!isObject(product) || !productId || productId.length > 128 || productId.includes('/') || product.userId !== user.clerk_id || product.version !== 1 || product.builtIn === true) return json({ error: 'Invalid custom product.' }, 400);
    product.id = productId;
    const dataJson = JSON.stringify(product);
    if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Custom product is too large.' }, 413);
    const slotValues = Array.from({ length: MAX_CUSTOM_PRODUCTS }, (_, index) => `('product-${String(index + 1).padStart(2, '0')}')`).join(', ');
    try {
      const result = await env.DB.prepare(`WITH slots(slot_id) AS (VALUES ${slotValues})
        INSERT INTO custom_products (user_id, slot_id, product_id, data_json)
        SELECT ?, slots.slot_id, ?, ? FROM slots
        WHERE NOT EXISTS (SELECT 1 FROM custom_products WHERE user_id = ? AND slot_id = slots.slot_id)
          AND (SELECT COUNT(*) FROM custom_products WHERE user_id = ?) < ?
        ORDER BY slots.slot_id LIMIT 1`)
        .bind(user.clerk_id, product.id, dataJson, user.clerk_id, user.clerk_id, MAX_CUSTOM_PRODUCTS).run();
      if (!result.meta.changes) return json({ error: 'Custom product limit reached.' }, 409);
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        const duplicate = await env.DB.prepare('SELECT 1 AS found FROM custom_products WHERE user_id = ? AND product_id = ?')
          .bind(user.clerk_id, product.id).first();
        return duplicate
          ? json({ error: 'Custom product already exists.' }, 409)
          : json({ error: 'Custom product limit reached. Refresh and try again.' }, 409);
      }
      throw error;
    }
    return json({ success: true, product });
  }
  const productMatch = path.match(/^\/api\/custom-products\/([^/]+)$/);
  if (productMatch) {
    if (request.method !== 'PATCH' && request.method !== 'DELETE') return json({ error: 'Method not allowed.' }, 405);
    const productId = decodePathId(productMatch[1]);
    if (!productId || productId.includes('/')) return json({ error: 'Invalid custom product ID.' }, 400);
    const currentRow = await env.DB.prepare('SELECT slot_id, data_json FROM custom_products WHERE user_id = ? AND product_id = ?')
      .bind(user.clerk_id, productId).first();
    if (!currentRow) return json({ error: 'Custom product not found.' }, 404);
    const current = parseJson(currentRow.data_json) || {};
    const ifMatch = request.method === 'DELETE' ? request.headers.get('If-Match')?.trim() : '';
    const body = request.method === 'PATCH' || !ifMatch ? await readBody(request) : null;
    if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
    if (request.method === 'PATCH') {
      const product = body?.product;
      if (!isObject(product) || product.id !== productId || product.userId !== user.clerk_id || product.builtIn === true || !Number.isInteger(body.expectedVersion) || body.expectedVersion !== current.version || product.version !== current.version + 1) {
        return json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
      }
      const dataJson = JSON.stringify(product);
      if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Custom product is too large.' }, 413);
      const result = await env.DB.prepare(`UPDATE custom_products SET data_json = ? WHERE user_id = ? AND slot_id = ? AND product_id = ? AND json_extract(data_json, '$.version') = ?`)
        .bind(dataJson, user.clerk_id, currentRow.slot_id, productId, body.expectedVersion).run();
      return result.meta.changes ? json({ success: true, product }) : json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
    }
    if (request.method === 'DELETE') {
      const headerVersions = [...(ifMatch || '').matchAll(/(?:^|,\s*)(?:W\/)?"?(\d+)"?(?=\s*(?:,|$))/g)].map((match) => Number(match[1]));
      const expectedVersion = ifMatch
        ? headerVersions.includes(current.version) ? current.version : NaN
        : body?.expectedVersion;
      if (!Number.isInteger(expectedVersion) || expectedVersion !== current.version) return json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
      const result = await env.DB.prepare(`DELETE FROM custom_products WHERE user_id = ? AND slot_id = ? AND product_id = ?
        AND json_extract(data_json, '$.version') = ?`).bind(user.clerk_id, currentRow.slot_id, productId, expectedVersion).run();
      return result.meta.changes ? json({ success: true }) : json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
    }
  }

  const recordRoute = path.match(/^\/api\/(forecasts|discussions|verifications)(?:\/([^/]+))?$/);
  if (recordRoute) {
    const recordType = { forecasts: 'forecast', discussions: 'discussion', verifications: 'verification' }[recordRoute[1]];
    const recordId = recordRoute[2] ? decodePathId(recordRoute[2]) : '';
    if (recordId === null || recordId.includes('/')) return json({ error: 'Invalid record ID.' }, 400);
    if (request.method === 'GET' && !recordId) {
      const rows = await env.DB.prepare('SELECT record_id, data_json, created_at, updated_at FROM user_records WHERE user_id = ? AND record_type = ? ORDER BY updated_at DESC LIMIT 200')
        .bind(user.clerk_id, recordType).all();
      return json({ records: (rows.results || []).map((row) => ({ id: row.record_id, data: parseJson(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at })) });
    }
    if (request.method === 'PUT' && !recordId) {
      const body = await readBody(request);
      if (body === BODY_TOO_LARGE) return json({ error: 'Request body is too large.' }, 413);
      const id = typeof body?.id === 'string' ? body.id.trim() : '';
      if (!id || id.length > 128 || id.includes('/') || !isObject(body?.data)) return json({ error: 'Invalid record.' }, 400);
      const dataJson = JSON.stringify(body.data);
      if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Record is too large.' }, 413);
      const now = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO user_records (user_id, record_type, record_id, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, record_type, record_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
        .bind(user.clerk_id, recordType, id, dataJson, now, now).run();
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

  return json({ error: 'Not found.' }, 404);
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

const parseJson = (value) => {
  try { return JSON.parse(value); } catch { return null; }
};

const parseSentryDsn = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^https:\/\/(?:[^@/]+@)?(o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io)\/(\d+)\/?$/iu);
  return match ? { host: match[1], projectId: match[2] } : null;
};

const parseSentryEnvelopeDsn = (envelope) => {
  const firstLine = new TextDecoder().decode(envelope).split('\n').find((line) => line.trim());
  if (!firstLine) return null;
  try { return parseSentryDsn(JSON.parse(firstLine)?.dsn); } catch { return null; }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!(url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`))) return env.ASSETS.fetch(request);
    if (env.BETA_AUTH_BACKEND !== 'clerk-d1') {
      const configuredOrigin = env.BETA_API_ORIGIN;
      if (!configuredOrigin) return json({ error: 'The beta API origin is not configured.' }, 503);
      let apiOrigin;
      try { apiOrigin = new URL(configuredOrigin); } catch { return json({ error: 'The beta API origin is invalid.' }, 503); }
      if (apiOrigin.protocol !== 'https:' || apiOrigin.username || apiOrigin.password) return json({ error: 'The beta API origin must be an HTTPS URL.' }, 503);
      apiOrigin.pathname = `${apiOrigin.pathname.replace(/\/$/, '')}${url.pathname}`;
      apiOrigin.search = url.search;
      apiOrigin.hash = '';
      try {
        const response = await fetch(new Request(apiOrigin, request), { cf: { cacheTtl: 0 } });
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      } catch {
        return json({ error: 'The beta API is temporarily unavailable.' }, 502);
      }
    }
    if (url.pathname === '/api/webhooks/clerk' && request.method === 'POST') {
      let event;
      try {
        event = await verifyWebhook(request, { signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET });
      } catch (error) {
        console.warn('[beta-worker] Clerk webhook signature rejected', error instanceof Error ? error.message : 'verification failed');
        return json({ error: 'Invalid Clerk webhook signature.' }, 400);
      }
      if (event.type === 'user.deleted' && typeof event.data?.id === 'string') {
        if (!env.DB) return json({ error: 'Beta database is unavailable.' }, 503);
        try {
          authProfileCache.delete(event.data.id);
          await deleteBetaUserData(event.data.id, env);
          await flushStripeCleanupQueue(env);
        }
        catch (error) {
          console.error('[beta-worker] Clerk deletion cleanup failed', error instanceof Error ? error.message : 'cleanup failed');
          return json({ error: 'Clerk account cleanup failed.' }, 500);
        }
      }
      return json({ received: true });
    }
    try { return await handleApi(request, env); }
    catch (error) {
      console.error('[beta-worker] request failed', error);
      if (error?.code === 'CLERK_PROFILE_UNAVAILABLE') return json({ error: 'Authentication service is temporarily unavailable. Retry shortly.' }, 503);
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return json({ error: 'The beta API request timed out while contacting a billing provider.' }, 504);
      }
      return json({ error: 'The beta API request failed.' }, 500);
    }
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

async function readLimitedBody(request, limit) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export const __test = { authenticate, emailSnapshotKey, deleteBetaUserData };
