import { COUNT, DATASET, DAY, queryAnalytics } from './admin.mjs';
import { utcDay } from './daily-counts.mjs';

export const DIGEST_CRON = '0 13 * * *';
const DAY_MS = 86_400_000;
const KINDS = [['visit', 'Visitors'], ['active', 'Active users']];
const fmt = (value) => Math.round(value).toLocaleString('en-US');
const words = (name) => name.replaceAll('_', ' ');

/** Signed percent change, or null when there is no baseline to compare against. */
export function percentChange(current, baseline) {
  if (!baseline) return null;
  const change = Math.round(((current - baseline) / baseline) * 100);
  return `${change >= 0 ? '+' : ''}${change}%`;
}

const dayBefore = (day, offset) => utcDay(Date.parse(`${day}T00:00:00Z`) - offset * DAY_MS);

function sumRange(series, endDay, length) {
  let total = 0;
  for (let offset = 0; offset < length; offset += 1) total += series.get(dayBefore(endDay, offset)) ?? 0;
  return total;
}

/** Yesterday, the trailing 7-day comparison, records and week-over-week numbers for one D1 count kind. */
export function summarizeKind(rows, kind, yesterday) {
  const series = new Map(rows.filter((row) => row.kind === kind && row.day <= yesterday).map((row) => [row.day, row.count]));
  const count = series.get(yesterday) ?? 0;
  const priorCounts = [...series].filter(([day]) => day < yesterday).map(([, value]) => value);
  const priorAverage = sumRange(series, dayBefore(yesterday, 1), 7) / 7;
  const lastWeek = sumRange(series, yesterday, 7);
  const previousWeek = sumRange(series, dayBefore(yesterday, 7), 7);
  // Daily counts never change after their UTC day ends, so beating every earlier day is announced exactly once.
  const record = count > 0 && priorCounts.length > 0 && count > Math.max(...priorCounts);
  return { count, priorAverage, lastWeek, previousWeek, record, previousBest: priorCounts.length ? Math.max(...priorCounts) : 0 };
}

export function buildEventsDigestQuery(days) {
  return `SELECT blob1 AS event, blob2 AS detail, ${DAY}, ${COUNT} FROM ${DATASET} WHERE timestamp >= NOW() - INTERVAL '${days}' DAY GROUP BY event, detail, day LIMIT 10000`;
}

function totals(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) map.set(key, (map.get(key) ?? 0) + Number(row.count ?? 0));
  }
  return map;
}

const top = (map, limit = 5) => [...map].sort((a, b) => b[1] - a[1]).slice(0, limit);
const featureKey = (row) => (row.event === 'page_view' ? null : row.event);
const pageKey = (row) => (row.event === 'page_view' ? row.detail || '/' : null);

/** Top features and pages yesterday, plus the biggest week-over-week feature movers. */
export function summarizeEvents(data, yesterday) {
  const lastWeekStart = dayBefore(yesterday, 6);
  const previousWeekStart = dayBefore(yesterday, 13);
  const dayRows = data.filter((row) => row.day === yesterday);
  const lastWeek = totals(data.filter((row) => row.day >= lastWeekStart && row.day <= yesterday), featureKey);
  const previousWeek = totals(data.filter((row) => row.day >= previousWeekStart && row.day < lastWeekStart), featureKey);
  const movers = [...new Set([...lastWeek.keys(), ...previousWeek.keys()])]
    .map((name) => ({ name, current: lastWeek.get(name) ?? 0, previous: previousWeek.get(name) ?? 0 }))
    .map((item) => ({ ...item, delta: item.current - item.previous }))
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  return { features: top(totals(dayRows, featureKey)), pages: top(totals(dayRows, pageKey)), movers };
}

async function loadEvents(env, days) {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_API_TOKEN) return null;
  try { return await queryAnalytics(env, buildEventsDigestQuery(days)); }
  catch { return null; }
}

function countLine(label, stats) {
  const change = percentChange(stats.count, stats.priorAverage);
  return `**${label}:** ${fmt(stats.count)}${change ? ` (${change} vs 7-day avg ${fmt(stats.priorAverage)})` : ''}`;
}

const listLine = (label, items) => `**${label}:** ${items.length ? items.map(([name, count]) => `${words(name)} ${fmt(count)}`).join(' · ') : 'none'}`;

function trendLines(kinds, events) {
  const lines = ['', '**Week over week** (last 7 days vs the 7 before)'];
  for (const [label, stats] of kinds) lines.push(`${label}: ${fmt(stats.lastWeek)} vs ${fmt(stats.previousWeek)}${percentChange(stats.lastWeek, stats.previousWeek) ? ` (${percentChange(stats.lastWeek, stats.previousWeek)})` : ''}`);
  if (events?.movers.length) lines.push(`Biggest movers: ${events.movers.map((item) => `${words(item.name)} ${item.delta > 0 ? '+' : ''}${fmt(item.delta)}`).join(' · ')}`);
  return lines;
}

/** Builds the Discord payload for one daily digest; Mondays add the week-over-week trend section. */
export function buildDigest({ rows, events, yesterday, monday }) {
  const kinds = KINDS.map(([kind, label]) => [label, summarizeKind(rows, kind, yesterday)]);
  const lines = kinds.map(([label, stats]) => countLine(label, stats));
  lines.push(`**Last 7 days:** ${kinds.map(([label, stats]) => `${fmt(stats.lastWeek)} ${label.toLowerCase()}`).join(' · ')}`);
  if (events) lines.push('', listLine('Top features', events.features), listLine('Top pages', events.pages));
  else lines.push('', '_Feature and page breakdown unavailable._');
  if (monday) lines.push(...trendLines(kinds, events));
  const records = kinds.filter(([, stats]) => stats.record)
    .map(([label, stats]) => `🏆 New record: ${fmt(stats.count)} ${label.toLowerCase()} (previous best ${fmt(stats.previousBest)})`);
  return {
    content: records.length ? records.join('\n') : '',
    embeds: [{ title: `GFC daily usage · ${yesterday} (UTC)`, description: lines.join('\n').slice(0, 4096), url: 'https://telemetry.gfcweather.com/admin/' }],
    allowed_mentions: { parse: [] },
  };
}

/** Posts yesterday's usage digest to TELEMETRY_DISCORD_WEBHOOK_URL; a no-op when it is unset. */
export async function sendDailyDigest(env, now) {
  if (!env.TELEMETRY_DISCORD_WEBHOOK_URL) return 'disabled';
  const yesterday = utcDay(now - DAY_MS);
  const monday = new Date(now).getUTCDay() === 1;
  const result = await env.TELEMETRY_DB.prepare('SELECT kind, day, count FROM telemetry_daily_counts WHERE day <= ? ORDER BY day ASC').bind(yesterday).all();
  const data = await loadEvents(env, monday ? 15 : 2);
  const events = data ? summarizeEvents(data, yesterday) : null;
  const payload = buildDigest({ rows: result.results ?? [], events, yesterday, monday });
  const response = await (env.FETCH ?? fetch)(env.TELEMETRY_DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Discord webhook returned ${response.status}`);
  return 'sent';
}
