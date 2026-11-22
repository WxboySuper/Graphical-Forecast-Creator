import { COUNT, DATASET, DAY, queryAnalytics } from './admin.mjs';
import { utcDay } from './daily-counts.mjs';

export const DIGEST_CRON = '0 13 * * *';

/** A digest failure whose message holds only safe detail such as an HTTP status. */
export class DigestError extends Error {}
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
export function summarizeKind(rows, kind, yesterday, best) {
  const series = new Map(rows.filter((row) => row.kind === kind && row.day <= yesterday).map((row) => [row.day, row.count]));
  const count = series.get(yesterday) ?? 0;
  const previousBest = best?.best ?? 0;
  // Daily counts never change after their UTC day ends, so beating every earlier day is announced exactly once.
  const record = count > 0 && (best?.days ?? 0) > 0 && count > previousBest;
  return {
    count,
    priorAverage: sumRange(series, dayBefore(yesterday, 1), 7) / 7,
    lastWeek: sumRange(series, yesterday, 7),
    previousWeek: sumRange(series, dayBefore(yesterday, 7), 7),
    record,
    previousBest,
  };
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
  const lines = ['', '**Week over week** (summed daily counts, last 7 days vs the 7 before)'];
  for (const [label, stats] of kinds) {
    const change = percentChange(stats.lastWeek, stats.previousWeek);
    lines.push(`${label}: ${fmt(stats.lastWeek)} vs ${fmt(stats.previousWeek)}${change ? ` (${change})` : ''}`);
  }
  if (events?.movers.length) lines.push(`Biggest movers: ${events.movers.map((item) => `${words(item.name)} ${item.delta > 0 ? '+' : ''}${fmt(item.delta)}`).join(' · ')}`);
  return lines;
}

/** Builds the Discord payload for one daily digest; Mondays add the week-over-week trend section. */
export function buildDigest({ rows, bests = [], events, yesterday, monday }) {
  const kinds = KINDS.map(([kind, label]) => [label, summarizeKind(rows, kind, yesterday, bests.find((row) => row.kind === kind))]);
  const lines = kinds.map(([label, stats]) => countLine(label, stats));
  lines.push(`**Last 7 days (summed daily counts):** ${kinds.map(([label, stats]) => `${fmt(stats.lastWeek)} ${label.toLowerCase()}`).join(' · ')}`);
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
  // Only the last 14 days feed the averages and weekly totals; the all-time best before yesterday comes from one aggregate.
  const result = await env.TELEMETRY_DB.prepare('SELECT kind, day, count FROM telemetry_daily_counts WHERE day >= ? AND day <= ? ORDER BY day ASC').bind(dayBefore(yesterday, 13), yesterday).all();
  const bests = await env.TELEMETRY_DB.prepare('SELECT kind, MAX(count) AS best, COUNT(*) AS days FROM telemetry_daily_counts WHERE day < ? GROUP BY kind').bind(yesterday).all();
  const data = await loadEvents(env, monday ? 15 : 2);
  const events = data ? summarizeEvents(data, yesterday) : null;
  const payload = buildDigest({ rows: result.results ?? [], bests: bests.results ?? [], events, yesterday, monday });
  const send = (body) => (env.FETCH ?? fetch)(env.TELEMETRY_DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  // A forum webhook needs a thread name; a text-channel webhook rejects one with a 4xx, so retry once without it.
  let response = await send({ ...payload, thread_name: `Daily usage ${yesterday}` });
  if (response.status >= 400 && response.status < 500 && response.status !== 429) response = await send(payload);
  if (!response.ok) throw new DigestError(`Discord webhook returned ${response.status}`);
  return 'sent';
}
