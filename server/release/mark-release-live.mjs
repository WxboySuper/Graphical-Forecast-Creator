#!/usr/bin/env node
/**
 * Sets production-release.json status to live after promote.
 * Usage: node mark-release-live.mjs [--config PATH]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeProductionReleaseConfig } from '../lib/production-release.mjs';

/**
 * Resolves manifest path from --config or CONFIG_PATH env.
 * @returns {string} Absolute or relative path to production-release.json
 */
function configPathFromArgs() {
  const index = process.argv.indexOf('--config');
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return process.env.CONFIG_PATH || '/opt/gfc-analytics/config/production-release.json';
}

/**
 * Writes live status and promotedAt onto the VPS manifest.
 */
function main() {
  const path = configPathFromArgs();
  const config = normalizeProductionReleaseConfig(JSON.parse(readFileSync(path, 'utf8')));
  const updated = {
    ...config,
    status: 'live',
    promotedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
}

main();
