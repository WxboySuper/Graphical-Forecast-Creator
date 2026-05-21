#!/usr/bin/env node
// Analytics log viewer — prints a summary of page views.
//
// Usage (local dev):  node scripts/view-analytics.js server/logs/analytics.log
// Usage (on VPS):     node /opt/gfc-analytics/../scripts/view-analytics.js
//                     — or just:  node view-analytics.js  (from /opt/gfc-analytics/)
//
// The default path resolves to server/logs/analytics.log relative to project root.
'use strict';

const fs = require('fs');
const path = require('path');

function resolveLogPath(args) {
  return args[2] || path.join(__dirname, '..', 'server', 'logs', 'analytics.log');
}

async function readAnalyticsLog(logFile) {
  let raw;
  try {
    raw = await fs.promises.readFile(logFile, 'utf8');
    raw = raw.trim();
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`No log file found at: ${logFile}`);
      console.error('Pass the path as an argument: node scripts/view-analytics.js /path/to/analytics.log');
      process.exit(1);
    }
    throw err;
  }

  if (!raw) {
    console.log('Log file is empty — no views recorded yet.');
    process.exit(0);
  }
  return raw;
}

function parseLogEntries(raw) {
  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  if (entries.length === 0) {
    console.log('No valid entries found.');
    process.exit(0);
  }
  return entries;
}

const countBy = (arr, key) => {
  const map = {};
  arr.forEach(e => {
    const v = (e[key] || '(none)').toString().trim() || '(none)';
    map[v] = (map[v] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
};

function printAnalyticsSummary(entries) {
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter(e => e.ts && e.ts.startsWith(today));
  const uniqueIps = new Set(entries.map(e => e.ip)).size;

  const hr = '─'.repeat(50);

  console.log('═'.repeat(50));
  console.log('  GFC Analytics Summary');
  console.log('═'.repeat(50));
  console.log(`  Total page views (all time) : ${entries.length}`);
  console.log(`  Unique IPs (approx.)        : ${uniqueIps}`);
  console.log(`  Views today (${today})  : ${todayEntries.length}`);

  console.log(`\n── Top Pages ${hr.slice(12)}`);
  countBy(entries, 'page').slice(0, 10).forEach(([page, count]) => {
    console.log(`  ${String(count).padStart(5)}  ${page}`);
  });

  console.log(`\n── Top Referrers ${hr.slice(16)}`);
  countBy(entries, 'ref').slice(0, 10).forEach(([ref, count]) => {
    console.log(`  ${String(count).padStart(5)}  ${ref}`);
  });

  console.log(`\n── Last 20 Views ${hr.slice(16)}`);
  [...entries].slice(-20).reverse().forEach(e => {
    const ts = (e.ts || '').slice(0, 19);
    const page = (e.page || '/').padEnd(35);
    console.log(`  ${ts}  ${page}  ${e.ip || ''}`);
  });

  console.log('═'.repeat(50));
}

async function main() {
  const logFile = resolveLogPath(process.argv);
  const rawData = await readAnalyticsLog(logFile);
  const entries = parseLogEntries(rawData);
  printAnalyticsSummary(entries);
}

main().catch(console.error);
