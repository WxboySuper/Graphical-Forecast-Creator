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

/** Resolves the analytics log path from CLI args or the default server log location. */
function resolveLogPath(args) {
  return args[2] || path.join(__dirname, '..', 'server', 'logs', 'analytics.log');
}

/** Reads and trims the analytics log file, exiting when missing or empty. */
async function readAnalyticsLog(logFile) {
  let fileContents = '';
  try {
    fileContents = (await fs.promises.readFile(logFile, 'utf8')).trim();
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`No log file found at: ${logFile}`);
      console.error('Pass the path as an argument: node scripts/view-analytics.js /path/to/analytics.log');
      process.exit(1);
    }
    throw err;
  }

  if (!fileContents) {
    console.log('Log file is empty — no views recorded yet.');
    process.exit(0);
  }
  return fileContents;
}

/** Parses newline-delimited JSON log lines into valid entry objects. */
function parseLogEntries(fileContents) {
  const entries = fileContents
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (entries.length === 0) {
    console.log('No valid entries found.');
    process.exit(0);
  }
  return entries;
}

/** Groups array items by key and returns sorted [value, count] pairs descending. */
const countBy = (arr, key) => {
  const map = {};
  arr.forEach((entry) => {
    const value = (entry[key] || '(none)').toString().trim() || '(none)';
    map[value] = (map[value] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
};

/** Prints totals, top pages/referrers, and the latest views to stdout. */
function printAnalyticsSummary(entries) {
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter((entry) => entry.ts?.startsWith(today));
  const uniqueIps = new Set(entries.map((entry) => entry.ip)).size;

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
  [...entries].slice(-20).reverse().forEach((entry) => {
    const ts = (entry.ts || '').slice(0, 19);
    const page = (entry.page || '/').padEnd(35);
    console.log(`  ${ts}  ${page}  ${entry.ip || ''}`);
  });

  console.log('═'.repeat(50));
}

/** Loads the log file and prints the analytics summary. */
async function main() {
  const logFile = resolveLogPath(process.argv);
  const fileContents = await readAnalyticsLog(logFile);
  const entries = parseLogEntries(fileContents);
  printAnalyticsSummary(entries);
}

main().catch(console.error);
