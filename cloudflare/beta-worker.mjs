import { verifyToken } from '@clerk/backend';
import { verifyWebhook } from '@clerk/backend/webhooks';

const API_PREFIX = '/api';
const MAX_CYCLE_BYTES = 750_000;
const MAX_CLOUD_CYCLES = 100;
const MAX_SENTRY_ENVELOPE_BYTES = 100 * 1024;

const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});

const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const readBearer = (request) => {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};

async function authenticate(request, env) {
  const token = readBearer(request);
  if (!token || !env.CLERK_JWT_KEY) { console.warn('[beta-worker] missing token or JWT key', Boolean(token), Boolean(env.CLERK_JWT_KEY)); return null; }
  try {
    const verified = await verifyToken(token, {
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: ['https://beta.gfcweather.com'],
    });
    const data = verified?.data || verified;
    const errors = verified?.errors;
    if (errors?.length || !data?.sub) {
      if (errors?.length) console.warn('[beta-worker] Clerk token rejected', errors.map((error) => error.message).join('; '));
      return null;
    }
    if (!env.CLERK_SECRET_KEY) return null;
    const profileResponse = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(data.sub)}`, {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    });
    if (!profileResponse.ok) { console.warn('[beta-worker] Clerk profile response rejected', profileResponse.status); return null; }
    const profile = await profileResponse.json();
    const primary = Array.isArray(profile.email_addresses)
      ? profile.email_addresses.find((entry) => entry.id === profile.primary_email_address_id)
      : null;
    const email = normalizeEmail(primary?.email_address);
    if (!email || primary?.verification?.status !== 'verified') { console.warn('[beta-worker] Clerk primary email is not verified', Boolean(email), primary?.verification?.status); return null; }
    const displayName = [profile.first_name, profile.last_name].filter((part) => typeof part === 'string' && part).join(' ');
    return { clerkId: data.sub, email, displayName };
  } catch (error) {
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
  const existing = await env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(user.clerkId).first();
  if (existing) {
    if (normalizeEmail(existing.email) !== user.email) {
      await env.DB.prepare('UPDATE users SET email = ?, email_verified = 1, updated_at = ? WHERE clerk_id = ?')
        .bind(user.email, new Date().toISOString(), user.clerkId).run();
    }
    if (existing.migration_status === 'complete') {
      return await env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(user.clerkId).first();
    }
  }

  const emailOwner = await env.DB.prepare('SELECT clerk_id FROM users WHERE email = ?').bind(user.email).first();
  if (emailOwner && emailOwner.clerk_id !== user.clerkId) {
    throw new Error('EMAIL_ALREADY_LINKED');
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
    await env.DB.prepare(`INSERT INTO users (clerk_id, email, legacy_uid, email_verified, display_name, beta_access,
      migration_status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`)
      .bind(user.clerkId, user.email, snapshot?.uid || null, user.displayName, snapshot?.userProfile?.betaAccess === true ? 1 : 0,
        migrationStatus, now, now).run();
  } else {
    await env.DB.prepare(`UPDATE users SET migration_status = ?,
      beta_access = CASE WHEN ? = 1 THEN 1 ELSE beta_access END, updated_at = ? WHERE clerk_id = ?`)
      .bind(migrationStatus, snapshot?.userProfile?.betaAccess === true ? 1 : 0, now, user.clerkId).run();
  }

  if (snapshot) {
    try {
      const statements = [];
      const settings = snapshot.userSettings;
      if (settings) {
        const settingsWithoutLegacyCycles = { ...settings };
        delete settingsWithoutLegacyCycles.cloudCycles;
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO user_settings (user_id, data_json) VALUES (?, ?)').bind(user.clerkId, JSON.stringify(settingsWithoutLegacyCycles)));
      }
      const entitlement = snapshot.userEntitlement;
      if (entitlement) statements.push(env.DB.prepare('INSERT OR IGNORE INTO user_entitlements (user_id, data_json) VALUES (?, ?)').bind(user.clerkId, JSON.stringify({ ...entitlement, uid: user.clerkId })));
      const metrics = snapshot.userMetrics;
      if (metrics) statements.push(env.DB.prepare('INSERT OR IGNORE INTO user_metrics (user_id, data_json) VALUES (?, ?)').bind(user.clerkId, JSON.stringify({ ...metrics, uid: user.clerkId })));
      for (const cycle of snapshot.cloudCycles || []) {
        statements.push(env.DB.prepare(`INSERT OR IGNORE INTO cloud_cycles
          (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(cycle.id, user.clerkId, cycle.label || '', cycle.cycleDate || '', JSON.stringify({ ...(cycle.metadata || {}), userId: user.clerkId }),
            cycle.payloadJson || '{}', cycle.payloadBytes || new TextEncoder().encode(cycle.payloadJson || '{}').length,
            cycle.createdAt || now, cycle.updatedAt || now));
      }
      for (const record of snapshot.workflowAwareness || []) {
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO workflow_awareness (user_id, cycle_id, data_json) VALUES (?, ?, ?)')
          .bind(user.clerkId, record.id, JSON.stringify(record.data)));
      }
      for (const product of snapshot.customProducts || []) {
        const migratedProduct = { ...(product.data || {}), userId: user.clerkId };
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO custom_products (user_id, slot_id, product_id, data_json) VALUES (?, ?, ?, ?)')
          .bind(user.clerkId, product.id, migratedProduct.id || '', JSON.stringify(migratedProduct)));
      }
      if (statements.length) await env.DB.batch(statements);
      await env.DB.prepare('UPDATE users SET migration_status = ?, migrated_at = ?, updated_at = ? WHERE clerk_id = ?')
        .bind('complete', now, now, user.clerkId).run();
    } catch (error) {
      await env.DB.prepare('UPDATE users SET migration_status = ?, updated_at = ? WHERE clerk_id = ?')
        .bind('failed', new Date().toISOString(), user.clerkId).run();
      throw error;
    }
  }

  return await env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(user.clerkId).first();
}

const readBody = async (request) => {
  try { return await request.json(); } catch { return null; }
};

async function stripeRequest(env, endpoint, params, method = 'POST') {
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    ...(params ? { body: new URLSearchParams(params) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'Stripe request failed.');
  return body;
}

async function verifyStripeSignature(payload, header, secret) {
  const values = Object.fromEntries((header || '').split(',').map((part) => part.split('=')));
  if (!values.t || !values.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${values.t}.${payload}`));
  const expected = Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (expected.length !== values.v1.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ values.v1.charCodeAt(index);
  return difference === 0 && Math.abs(Date.now() / 1000 - Number(values.t)) <= 300;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/api/health' && request.method === 'GET') {
    return json({ status: 'ok', service: 'gfc-beta-worker', database: Boolean(env.DB) });
  }
  if (path === '/api/billing/config' && request.method === 'GET') {
    const checkoutEnabled = Boolean(env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_MONTHLY || env.STRIPE_PRICE_ANNUAL_STANDARD));
    return json({ billingEnabled: Boolean(env.STRIPE_SECRET_KEY), checkoutEnabled, annualPromoActive: false,
      monthlyDisplayPrice: env.MONTHLY_DISPLAY_PRICE || '$3/month', annualDisplayPrice: env.ANNUAL_DISPLAY_PRICE || '$30/year' });
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
    const envelope = new Uint8Array(await request.arrayBuffer());
    if (!envelope.length || envelope.byteLength > MAX_SENTRY_ENVELOPE_BYTES) return json({ error: 'Invalid Sentry envelope.' }, 400);
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
    const raw = await request.text();
    if (!(await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'Invalid Stripe signature.' }, 400);
    const event = JSON.parse(raw);
    if (await env.DB.prepare('SELECT event_id FROM stripe_events WHERE event_id = ?').bind(event.id).first()) return json({ received: true, duplicate: true });
    const object = event.data?.object || {};
    let subscription = object;
    if (event.type === 'checkout.session.completed' && object.subscription) subscription = await stripeRequest(env, `subscriptions/${object.subscription}`, null, 'GET');
    if (event.type.startsWith('customer.subscription.') || event.type === 'checkout.session.completed') {
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
        await env.DB.prepare(`INSERT INTO user_entitlements (user_id, data_json) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP`)
          .bind(owner.clerk_id, JSON.stringify(entitlement)).run();
      }
    }
    await env.DB.prepare('INSERT INTO stripe_events (event_id, processed_at) VALUES (?, ?)').bind(event.id, new Date().toISOString()).run();
    return json({ received: true });
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
    const plan = body?.plan;
    const price = plan === 'monthly' ? env.STRIPE_PRICE_MONTHLY : plan === 'annual' ? env.STRIPE_PRICE_ANNUAL_STANDARD : null;
    if (!price) return json({ error: 'This billing plan is not available.' }, 400);
    const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id) || {};
    const params = {
      mode: 'subscription',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      success_url: 'https://beta.gfcweather.com/account?checkout=success',
      cancel_url: 'https://beta.gfcweather.com/pricing?checkout=cancelled',
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
    const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
    if (!entitlement?.stripeCustomerId) return json({ error: 'No billing account is associated with this user.' }, 400);
    const portal = await stripeRequest(env, 'billing_portal/sessions', {
      customer: entitlement.stripeCustomerId,
      return_url: 'https://beta.gfcweather.com/account',
    });
    return json({ url: portal.url });
  }

  if (path === '/api/beta/claim' && request.method === 'POST') {
    if (!user.beta_access && env.BETA_INVITE_TOKEN) {
      const body = await readBody(request);
      if (!body || body.token !== env.BETA_INVITE_TOKEN || (env.BETA_INVITE_PATH && body.invitePath !== env.BETA_INVITE_PATH)) return json({ error: 'Invalid invite.' }, 403);
      await env.DB.prepare('UPDATE users SET beta_access = 1, updated_at = ? WHERE clerk_id = ?').bind(new Date().toISOString(), user.clerk_id).run();
    }
    const updated = await env.DB.prepare('SELECT beta_access FROM users WHERE clerk_id = ?').bind(user.clerk_id).first();
    return json({ betaAccess: Boolean(updated?.beta_access) });
  }

  if (path === '/api/user/settings' && request.method === 'GET') return json({ settings: await readJsonRecord(env.DB, 'user_settings', user.clerk_id) });
  if (path === '/api/user/settings' && request.method === 'PUT') {
    const body = await readBody(request);
    if (!isObject(body?.settings)) return json({ error: 'Invalid settings.' }, 400);
    await env.DB.prepare(`INSERT INTO user_settings (user_id, data_json) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(user.clerk_id, JSON.stringify(body.settings)).run();
    return json({ success: true });
  }

  if (path === '/api/user/entitlement' && request.method === 'GET') return json({ entitlement: await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id) });
  if (path === '/api/user/metrics' && request.method === 'GET') return json({ metrics: await readJsonRecord(env.DB, 'user_metrics', user.clerk_id) });
  if (path === '/api/admin/metrics' && request.method === 'GET') {
    const allowed = (env.ADMIN_CLERK_ID_ALLOWLIST || env.ADMIN_UID_ALLOWLIST || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!allowed.includes(user.clerk_id) && !(user.legacy_uid && allowed.includes(user.legacy_uid))) return json({ error: 'Admin access denied.' }, 403);
    const days = url.searchParams.get('window') === '30' ? 30 : url.searchParams.get('window') === '7' ? 7 : null;
    if (!days) return json({ error: 'Invalid metrics window.' }, 400);
    const accounts = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
    const premium = await env.DB.prepare("SELECT COUNT(*) AS count FROM user_entitlements WHERE json_extract(data_json, '$.billingStatus') IN ('active', 'trialing')").first();
    const metricRows = await env.DB.prepare('SELECT data_json FROM user_metrics').all();
    const summary = { totalAccounts: Number(accounts?.count || 0), activeDevices: 0, activeSignedInAccounts: 0, premiumSubscriptions: Number(premium?.count || 0), storageBytes: 0, signups: 0, signIns: 0, upgrades: 0, cancellations: 0, cloudSaves: 0, cloudLoads: 0 };
    for (const row of metricRows.results || []) {
      const metrics = parseJson(row.data_json) || {};
      for (const [target, field] of [['cloudSaves', 'cloudCyclesSaved'], ['signIns', 'signIns'], ['signups', 'signups'], ['upgrades', 'upgrades'], ['cancellations', 'cancellations'], ['cloudLoads', 'cloudLoads']]) summary[target] += Number(metrics[field] || 0);
    }
    return json({ metricsEnabled: true, window: days, summary, dailyMetrics: [] });
  }

  if (path === '/api/cloud-cycles' && request.method === 'GET') {
    const result = await env.DB.prepare(`SELECT id, user_id AS userId, label, cycle_date AS cycleDate, metadata_json, created_at AS createdAt, updated_at AS updatedAt
      FROM cloud_cycles WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`).bind(user.clerk_id, MAX_CLOUD_CYCLES).all();
    return json({ cycles: (result.results || []).map((row) => ({ ...row, ...parseJson(row.metadata_json), metadata: parseJson(row.metadata_json) })) });
  }
  if (path === '/api/cloud-cycles' && request.method === 'POST') {
    const body = await readBody(request);
    const id = typeof body?.id === 'string' ? body.id : '';
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    const cycleDate = typeof body?.cycleDate === 'string' ? body.cycleDate : '';
    const payloadJson = typeof body?.payloadJson === 'string' ? body.payloadJson : '';
    const bytes = new TextEncoder().encode(payloadJson).length;
    if (!id || id.length > 128 || !label || label.length > 200 || !cycleDate || bytes > MAX_CYCLE_BYTES || !isObject(body?.metadata)) return json({ error: 'Invalid cloud cycle payload.' }, 400);
    const entitlement = await readJsonRecord(env.DB, 'user_entitlements', user.clerk_id);
    if (entitlement?.premiumActive !== true) return json({ error: 'Premium cloud storage is required.' }, 403);
    const existing = await env.DB.prepare('SELECT user_id FROM cloud_cycles WHERE id = ?').bind(id).first();
    if (existing && existing.user_id !== user.clerk_id) return json({ error: 'Cloud cycle belongs to another account.' }, 409);
    if (!existing) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM cloud_cycles WHERE user_id = ?').bind(user.clerk_id).first();
      if ((count?.count || 0) >= MAX_CLOUD_CYCLES) return json({ error: 'Cloud storage quota reached.' }, 409);
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO cloud_cycles
      (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, cycle_date = excluded.cycle_date,
        metadata_json = excluded.metadata_json, payload_json = excluded.payload_json,
        payload_bytes = excluded.payload_bytes, updated_at = excluded.updated_at`)
      .bind(id, user.clerk_id, label, cycleDate, JSON.stringify(body.metadata), payloadJson, bytes, now, now).run();
    return json({ success: true, data: id });
  }
  const cycleMatch = path.match(/^\/api\/cloud-cycles\/([^/]+)$/);
  if (cycleMatch) {
    const id = decodeURIComponent(cycleMatch[1]);
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM cloud_cycles WHERE id = ? AND user_id = ?').bind(id, user.clerk_id).first();
      if (!row) return json({ error: 'Cloud cycle not found.' }, 404);
      return json({ cycle: { ...row, metadata: parseJson(row.metadata_json), payload: parseJson(row.payload_json) } });
    }
    if (request.method === 'PATCH') {
      const body = await readBody(request);
      if (typeof body?.label !== 'string' || !body.label.trim() || body.label.length > 200) return json({ error: 'Invalid label.' }, 400);
      const result = await env.DB.prepare('UPDATE cloud_cycles SET label = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(body.label.trim(), new Date().toISOString(), id, user.clerk_id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: 'Cloud cycle not found.' }, 404);
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM cloud_cycles WHERE id = ? AND user_id = ?').bind(id, user.clerk_id).run();
      return json({ success: true });
    }
  }

  if (path === '/api/workflow-awareness' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT cycle_id AS id, data_json FROM workflow_awareness WHERE user_id = ?')
      .bind(user.clerk_id).all();
    return json({ records: (result.results || []).map((row) => {
      const stored = parseJson(row.data_json) || {};
      return { ...(stored.metadata || {}), consentVersion: stored.consentVersion, schemaVersion: stored.schemaVersion };
    }) });
  }
  if (path === '/api/workflow-awareness' && request.method === 'PUT') {
    const body = await readBody(request);
    if (!isObject(body?.record?.metadata) || typeof body.record.metadata.cycleId !== 'string') return json({ error: 'Invalid workflow record.' }, 400);
    await env.DB.prepare(`INSERT INTO workflow_awareness (user_id, cycle_id, data_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, cycle_id) DO UPDATE SET data_json = excluded.data_json`)
      .bind(user.clerk_id, body.record.metadata.cycleId, JSON.stringify(body.record)).run();
    return json({ success: true });
  }
  if (path === '/api/workflow-awareness' && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ?').bind(user.clerk_id).run();
    return json({ success: true });
  }
  const awarenessMatch = path.match(/^\/api\/workflow-awareness\/([^/]+)$/);
  if (awarenessMatch && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ? AND cycle_id = ?')
      .bind(user.clerk_id, decodeURIComponent(awarenessMatch[1])).run();
    return json({ success: true });
  }

  if (path === '/api/custom-products' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT data_json FROM custom_products WHERE user_id = ? ORDER BY slot_id')
      .bind(user.clerk_id).all();
    return json({ products: (result.results || []).map((row) => parseJson(row.data_json)) });
  }
  if (path === '/api/custom-products' && request.method === 'POST') {
    const body = await readBody(request);
    const product = body?.product;
    if (!isObject(product) || typeof product.id !== 'string' || product.userId !== user.clerk_id || product.version !== 1 || product.builtIn === true) return json({ error: 'Invalid custom product.' }, 400);
    const occupied = await env.DB.prepare('SELECT slot_id FROM custom_products WHERE user_id = ?').bind(user.clerk_id).all();
    const used = new Set((occupied.results || []).map((row) => row.slot_id));
    const slot = Array.from({ length: 16 }, (_, index) => `product-${String(index + 1).padStart(2, '0')}`).find((value) => !used.has(value));
    if (!slot) return json({ error: 'Custom product limit reached.' }, 409);
    const dataJson = JSON.stringify(product);
    if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Custom product is too large.' }, 413);
    try {
      await env.DB.prepare('INSERT INTO custom_products (user_id, slot_id, product_id, data_json) VALUES (?, ?, ?, ?)')
        .bind(user.clerk_id, slot, product.id, dataJson).run();
    } catch { return json({ error: 'Custom product already exists.' }, 409); }
    return json({ success: true, product });
  }
  const productMatch = path.match(/^\/api\/custom-products\/([^/]+)$/);
  if (productMatch) {
    const productId = decodeURIComponent(productMatch[1]);
    const currentRow = await env.DB.prepare('SELECT slot_id, data_json FROM custom_products WHERE user_id = ? AND product_id = ?')
      .bind(user.clerk_id, productId).first();
    if (!currentRow) return json({ error: 'Custom product not found.' }, 404);
    const current = parseJson(currentRow.data_json) || {};
    const body = await readBody(request);
    if (request.method === 'PATCH') {
      const product = body?.product;
      if (!isObject(product) || product.id !== productId || product.userId !== user.clerk_id || !Number.isInteger(body.expectedVersion) || body.expectedVersion !== current.version || product.version !== current.version + 1) {
        return json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
      }
      const dataJson = JSON.stringify(product);
      if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) return json({ error: 'Custom product is too large.' }, 413);
      const result = await env.DB.prepare(`UPDATE custom_products SET data_json = ? WHERE user_id = ? AND slot_id = ? AND product_id = ? AND json_extract(data_json, '$.version') = ?`)
        .bind(dataJson, user.clerk_id, currentRow.slot_id, productId, body.expectedVersion).run();
      return result.meta.changes ? json({ success: true, product }) : json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
    }
    if (request.method === 'DELETE') {
      if (!Number.isInteger(body?.expectedVersion) || body.expectedVersion !== current.version) return json({ error: 'This product changed in another session. Refresh and try again.' }, 409);
      await env.DB.prepare('DELETE FROM custom_products WHERE user_id = ? AND slot_id = ? AND product_id = ?')
        .bind(user.clerk_id, currentRow.slot_id, productId).run();
      return json({ success: true });
    }
  }

  const recordRoute = path.match(/^\/api\/(forecasts|discussions|verifications)(?:\/([^/]+))?$/);
  if (recordRoute) {
    const recordType = { forecasts: 'forecast', discussions: 'discussion', verifications: 'verification' }[recordRoute[1]];
    const recordId = recordRoute[2] ? decodeURIComponent(recordRoute[2]) : '';
    if (request.method === 'GET' && !recordId) {
      const rows = await env.DB.prepare('SELECT record_id, data_json, created_at, updated_at FROM user_records WHERE user_id = ? AND record_type = ? ORDER BY updated_at DESC LIMIT 200')
        .bind(user.clerk_id, recordType).all();
      return json({ records: (rows.results || []).map((row) => ({ id: row.record_id, data: parseJson(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at })) });
    }
    if (request.method === 'PUT' && !recordId) {
      const body = await readBody(request);
      const id = typeof body?.id === 'string' ? body.id : '';
      if (!id || id.length > 128 || !isObject(body?.data)) return json({ error: 'Invalid record.' }, 400);
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

async function readJsonRecord(db, table, userId) {
  const row = await db.prepare(`SELECT data_json FROM ${table} WHERE user_id = ?`).bind(userId).first();
  return row ? parseJson(row.data_json) : null;
}

async function deleteBetaUserData(userId, env) {
  const entitlement = await readJsonRecord(env.DB, 'user_entitlements', userId);
  if (entitlement?.stripeCustomerId) {
    if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe cleanup is not configured.');
    try { await stripeRequest(env, `customers/${encodeURIComponent(entitlement.stripeCustomerId)}`, null, 'DELETE'); }
    catch (error) {
      if (!String(error?.message || '').toLowerCase().includes('no such customer')) throw error;
    }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cloud_cycles WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM workflow_awareness WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM custom_products WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_records WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_entitlements WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_metrics WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE clerk_id = ?').bind(userId),
  ]);
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
        try { await deleteBetaUserData(event.data.id, env); }
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
      return json({ error: 'The beta API request failed.' }, 500);
    }
  },
};

export const __test = { authenticate, emailSnapshotKey, deleteBetaUserData };
