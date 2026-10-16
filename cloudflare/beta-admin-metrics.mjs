import { json } from './beta-worker-utils.mjs';

function isAdminUser(env, user) {
  const allowlist = `${env.ADMIN_CLERK_ID_ALLOWLIST || ''},${env.ADMIN_UID_ALLOWLIST || ''}`.split(',').map((value) => value.trim()).filter(Boolean);
  return allowlist.includes(user.clerk_id) || Boolean(user.legacy_uid && allowlist.includes(user.legacy_uid));
}

function readMetricsWindow(url) {
  const requested = url.searchParams.get('window');
  if (requested === '30') return 30;
  if (requested === '7') return 7;
  return null;
}

async function readAdminMetrics(url, env, user) {
  const accessError = getAdminAccessError(env, user);
  if (accessError) return accessError;
  const days = readMetricsWindow(url);
  if (!days) return json({ error: 'Invalid metrics window.' }, 400);
  const [accounts, premium, storage, rows] = await loadAdminMetricRows(env.DB, days);
  const dailyMetrics = rows.results || [];
  const summary = createAdminMetricsSummary({ accounts, premium, storage, dailyMetrics });
  return json({ metricsEnabled: true, window: days, summary, dailyMetrics });
}

function getAdminAccessError(env, user) {
  return isAdminUser(env, user) ? null : json({ error: 'Admin access denied.' }, 403);
}

function createAdminMetricsSummary({ accounts, premium, storage, dailyMetrics }) {
  const latest = dailyMetrics.at(-1) || {};
  return {
    totalAccounts: Number(accounts?.count || 0), activeDevices: Number(latest.activeDevices || 0),
    activeSignedInAccounts: Number(latest.activeSignedInAccounts || 0), premiumSubscriptions: Number(premium?.count || 0),
    storageBytes: Number(storage?.bytes || 0), ...sumAdminMetrics(dailyMetrics),
  };
}

async function loadAdminMetricRows(db, days) {
  const windowStart = `-${days - 1} days`;
  return Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM users').first(),
    db.prepare("SELECT COUNT(*) AS count FROM user_entitlements WHERE json_extract(data_json, '$.billingStatus') IN ('active', 'trialing')").first(),
    db.prepare('SELECT COALESCE(SUM(payload_bytes), 0) AS bytes FROM cloud_cycles').first(),
    db.prepare(`SELECT event_date AS date, COUNT(DISTINCT CASE WHEN event_type NOT IN ('upgrades', 'cancellations') THEN installation_id END) AS activeDevices,
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
}

function sumAdminMetrics(dailyMetrics) {
  return dailyMetrics.reduce((result, row) => {
    for (const key of ['signups', 'signIns', 'upgrades', 'cancellations', 'cloudSaves', 'cloudLoads']) result[key] += Number(row[key] || 0);
    return result;
  }, { signups: 0, signIns: 0, upgrades: 0, cancellations: 0, cloudSaves: 0, cloudLoads: 0 });
}

export { readAdminMetrics };
