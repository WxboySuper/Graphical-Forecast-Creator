#!/usr/bin/env node
/**
 * Prints manifest fields as tab-separated columns for shell scripts.
 * Usage: node read-manifest-fields.mjs [--config PATH]
 * Columns: version, releaseId, rolloutAt, status
 */
import { readFileSync } from 'node:fs';
import { normalizeProductionReleaseConfig } from '../lib/production-release.mjs';

/** @returns {string} */
function configPathFromArgs() {
  const index = process.argv.indexOf('--config');
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return process.env.CONFIG_PATH || '/opt/gfc-analytics/config/production-release.json';
}

/** Prints version, releaseId, rolloutAt, and status as TSV. */
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
