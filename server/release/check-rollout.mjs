#!/usr/bin/env node
/**
 * VPS cron entry: promote staged release when rolloutAt has passed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  normalizeProductionReleaseConfig,
  parseInstant,
} from '../lib/production-release.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/gfc-analytics/config/production-release.json';
const PROMOTE_SCRIPT = join(__dirname, 'promote-release.sh');

function loadConfig() {
  return normalizeProductionReleaseConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')));
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('[rollout] unable to read config:', error);
    process.exit(1);
  }

  if (config.action !== 'stage') {
    process.exit(0);
  }

  if (config.status === 'live' || config.status === 'cancelled') {
    process.exit(0);
  }

  if (config.status !== 'scheduled' && config.status !== 'staged') {
    process.exit(0);
  }

  const rolloutAtMs = parseInstant(config.rolloutAt);
  if (rolloutAtMs === null) {
    console.error('[rollout] missing rolloutAt');
    process.exit(1);
  }

  if (Date.now() < rolloutAtMs) {
    process.exit(0);
  }

  console.log(`[rollout] promoting ${config.version} (${config.releaseId})`);

  const result = spawnSync('bash', [PROMOTE_SCRIPT], { stdio: 'inherit' });
  if (result.status !== 0) {
    config.lastPromoteErrorAt = new Date().toISOString();
    saveConfig({ ...config, status: config.status ?? 'staged' });
    process.exit(result.status ?? 1);
  }

  process.exit(0);
}

main();
