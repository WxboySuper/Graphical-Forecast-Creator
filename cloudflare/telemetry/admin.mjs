import { authorizeViewer } from '../feedback/access.mjs';
import { json } from '../feedback/response.mjs';
import { ALLOWED_EVENTS, validVersion } from './events.mjs';

const DATASET = 'events.analyticsEngine.gfc_telemetry_events';
const DAY_MS = 86_400_000;

function today(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function parseDays(url) {
  const value = Number(url.searchParams.get('days') ?? 30);
  return Number.isInteger(value) && value >= 1 && value <= 90 ? value : null;
}

export function parseEventFilters(url) {
  const event = url.searchParams.get('event');
  const version = url.searchParams.get('version');
  if (event && !ALLOWED_EVENTS.includes(event)) return { error: 'Unknown event' };
  if (version && !validVersion(version)) return { error: 'Invalid version' };
  return { event, version };
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timeFilter(days) {
  return `timestamp >= NOW() - INTERVAL '${days}' DAY`;
}

export function buildEventsQuery(days, event, version) {
  const filters = [timeFilter(days)];
  if (event) filters.push(`blob1 = ${quote(event)}`);
  if (version) filters.push(`blob3 = ${quote(version)}`);
  return `SELECT blob1 AS event, blob2 AS detail, blob3 AS version, toDate(timestamp) AS day, SUM(double1) AS count FROM ${DATASET} WHERE ${filters.join(' AND ')} GROUP BY event, detail, version, day ORDER BY day ASC LIMIT 10000`;
}

export function buildPagesQuery(days) {
  return `SELECT blob2 AS page, blob3 AS version, toDate(timestamp) AS day, SUM(double1) AS count FROM ${DATASET} WHERE ${timeFilter(days)} AND blob1 = 'page_view' GROUP BY page, version, day ORDER BY day ASC LIMIT 10000`;
}

export function buildLocationsQuery(days) {
  return `SELECT blob4 AS country, toDate(timestamp) AS day, SUM(double1) AS count FROM ${DATASET} WHERE ${timeFilter(days)} GROUP BY country, day ORDER BY day ASC LIMIT 10000`;
}

async function queryAnalytics(env, query) {
  const response = await (env.FETCH ?? fetch)(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`, 'content-type': 'text/plain' },
      body: query,
    },
  );
  if (!response.ok) throw new Error('Analytics query failed');
  const result = await response.json();
  if (!Array.isArray(result.data)) throw new Error('Invalid analytics response');
  return result.data;
}

function configured(env) {
  return Boolean(env.TELEMETRY_DB && env.CF_ACCOUNT_ID && env.CF_ANALYTICS_API_TOKEN);
}

function dateFrom(now, days) {
  return today(now - (days - 1) * DAY_MS);
}

function buildOverview(daily, now) {
  const visitors = daily.filter((row) => row.kind === 'visit');
  const active = daily.filter((row) => row.kind === 'active');
  const recentVisitors = visitors.filter((row) => row.day >= today(now - 29 * DAY_MS));
  const roughMau = recentVisitors.reduce((sum, row) => sum + row.count, 0);
  return {
    dailyVisitors: visitors,
    dau: active,
    roughMau,
    totalAccounts: null,
    overlapCaveat: 'Rough MAU is the sum of daily unique visitors. The same person can count on several days, so it is not a unique 30-day account or person count.',
  };
}

async function overview({ env, now, days }) {
  const result = await env.TELEMETRY_DB
    .prepare('SELECT kind, day, count FROM telemetry_daily_counts WHERE day >= ? ORDER BY day ASC')
    .bind(dateFrom(now, days))
    .all();
  return json(buildOverview(result.results ?? [], now), 200, { 'cache-control': 'no-store' });
}

async function events({ url, env, days }) {
  const filters = parseEventFilters(url);
  if (filters.error) return json({ error: filters.error }, 400, { 'cache-control': 'no-store' });
  const data = await queryAnalytics(env, buildEventsQuery(days, filters.event, filters.version));
  return json({ days, data }, 200, { 'cache-control': 'no-store' });
}

async function pages({ env, days }) {
  const data = await queryAnalytics(env, buildPagesQuery(days));
  return json({ days, data }, 200, { 'cache-control': 'no-store' });
}

async function locations({ env, days }) {
  const data = await queryAnalytics(env, buildLocationsQuery(days));
  return json({ days, data }, 200, { 'cache-control': 'no-store' });
}

const GET_ROUTES = new Map([
  ['/admin/overview', overview],
  ['/admin/events', events],
  ['/admin/pages', pages],
  ['/admin/locations', locations],
]);

export async function readAdminData(path, url, env, now) {
  if (!configured(env)) return json({ error: 'Telemetry admin API is not configured' }, 503, { 'cache-control': 'no-store' });
  const days = parseDays(url);
  if (!days) return json({ error: 'days must be an integer from 1 to 90' }, 400, { 'cache-control': 'no-store' });
  const handler = GET_ROUTES.get(path);
  if (!handler) return json({ error: 'Not found' }, 404, { 'cache-control': 'no-store' });
  return handler({ url, env, now, days });
}

export async function handleAdmin(request, url, env, now) {
  const auth = await authorizeViewer(request, env);
  if (auth.response) {
    const headers = Object.fromEntries(auth.response.headers);
    return new Response(auth.response.body, { status: auth.response.status, headers: { ...headers, 'cache-control': 'no-store' } });
  }
  return readAdminData(url.pathname, url, env, now);
}
