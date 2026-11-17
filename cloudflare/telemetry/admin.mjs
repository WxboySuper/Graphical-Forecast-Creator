import { authorizeViewer } from '../feedback/access.mjs';
import { json } from '../feedback/response.mjs';
import { utcDay } from './daily-counts.mjs';
import { renderUsagePage } from './admin-page.mjs';
import { ALLOWED_EVENTS, validVersion } from './events.mjs';

const DATASET = 'events.analyticsEngine.gfc_telemetry_events';
const DAY_MS = 86_400_000;

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

const hasDatabase = (env) => Boolean(env.TELEMETRY_DB);
const hasAnalyticsAccess = (env) => Boolean(env.CF_ACCOUNT_ID && env.CF_ANALYTICS_API_TOKEN);
// The overview reads only D1 counts; the other routes also query Analytics Engine.
const configuredFor = (path, env) => hasDatabase(env) && (path === '/admin/overview' || hasAnalyticsAccess(env));

function dateFrom(now, days) {
  return utcDay(now - (days - 1) * DAY_MS);
}

function buildOverview(daily, now, from, days) {
  const visitors = daily.filter((row) => row.kind === 'visit');
  const active = daily.filter((row) => row.kind === 'active');
  const roughMauWindowDays = Math.min(days, 30);
  const mauFrom = utcDay(now - (roughMauWindowDays - 1) * DAY_MS);
  const mauCutoff = from > mauFrom ? from : mauFrom;
  const recentVisitors = visitors.filter((row) => row.day >= mauCutoff);
  const roughMau = recentVisitors.reduce((sum, row) => sum + row.count, 0);
  return {
    dailyVisitors: visitors,
    dau: active,
    roughMau,
    roughMauWindowDays,
    totalAccounts: null,
    overlapCaveat: `Rough MAU is the sum of daily unique visitors over the last ${roughMauWindowDays} UTC days. The same person can count on several days, so it is not a unique account or person count for that window.`,
  };
}

async function overview({ env, now, days }) {
  const result = await env.TELEMETRY_DB
    .prepare('SELECT kind, day, count FROM telemetry_daily_counts WHERE day >= ? ORDER BY day ASC')
    .bind(dateFrom(now, days))
    .all();
  return json(buildOverview(result.results ?? [], now, dateFrom(now, days), days), 200, { 'cache-control': 'no-store' });
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
  if (!configuredFor(path, env)) return json({ error: 'Telemetry admin API is not configured' }, 503, { 'cache-control': 'no-store' });
  const days = parseDays(url);
  if (!days) return json({ error: 'days must be an integer from 1 to 90' }, 400, { 'cache-control': 'no-store' });
  const handler = GET_ROUTES.get(path);
  if (!handler) return json({ error: 'Not found' }, 404, { 'cache-control': 'no-store' });
  return handler({ url, env, now, days });
}

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function usagePageResponse() {
  const value = nonce();
  const csp = `default-src 'none'; script-src 'nonce-${value}'; style-src 'nonce-${value}'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  return new Response(renderUsagePage(value), { headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': csp,
  } });
}

export async function handleAdmin(request, url, env, now) {
  const auth = await authorizeViewer(request, env);
  if (auth.response) {
    const headers = Object.fromEntries(auth.response.headers);
    return new Response(auth.response.body, { status: auth.response.status, headers: { ...headers, 'cache-control': 'no-store' } });
  }
  if (url.pathname === '/admin/') return usagePageResponse();
  return readAdminData(url.pathname, url, env, now);
}
