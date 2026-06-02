#!/usr/bin/env node
/**
 * Prints manifest fields as tab-separated columns for shell scripts.
 * Usage: node read-manifest-fields.mjs [--config PATH]
 * Columns: version, releaseId, rolloutAt, status
 */
import { readFileSync } from 'node:fs';
import { normalizeProductionReleaseConfig } from '../lib/production-release.mjs';

/**
 * Resolves manifest path from --config or CONFIG_PATH env.
 * @returns {string} Path to production-release.json
 */
function configPathFromArgs() {
  const index = process.argv.indexOf('--config');
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return process.env.CONFIG_PATH || '/opt/gfc-analytics/config/production-release.json';
}

/**
 * Prints version, releaseId, rolloutAt, and status as a single TSV line on stdout.
 */
function main() {
  const path = configPathFromArgs();
  const config = normalizeProductionReleaseConfig(JSON.parse(readFileSync(path, 'utf8')));
  const columns = [
    config.version,
    config.releaseId,
    config.rolloutAt ?? '',
    config.status ?? '',
  ];
  process.stdout.write(`${columns.join('\t')}\n`);
}

main();
