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

/** @returns {ReturnType<typeof normalizeProductionReleaseConfig>} */
function loadConfig() {
  return normalizeProductionReleaseConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')));
}

/** @param {ReturnType<typeof normalizeProductionReleaseConfig>} config */
function saveConfig(config) {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** @param {ReturnType<typeof normalizeProductionReleaseConfig>} config */
function shouldSkipRollout(config) {
  if (config.action !== 'stage') {
    return true;
  }
  if (config.status === 'live' || config.status === 'cancelled') {
    return true;
  }
  if (config.status !== 'scheduled' && config.status !== 'staged') {
    return true;
  }
  return false;
}

/** @param {ReturnType<typeof normalizeProductionReleaseConfig>} config */
function isRolloutDue(config) {
  const rolloutAtMs = parseInstant(config.rolloutAt);
  if (rolloutAtMs === null) {
    console.error('[rollout] missing rolloutAt');
    process.exit(1);
  }
  return Date.now() >= rolloutAtMs;
}

/** Cron entry: promote when rolloutAt has passed. */
function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('[rollout] unable to read config:', error);
    process.exit(1);
  }

  if (shouldSkipRollout(config)) {
    process.exit(0);
  }

  if (!isRolloutDue(config)) {
    process.exit(0);
  }

  console.log(`[rollout] promoting ${config.version} (${config.releaseId})`);

  const result = spawnSync('bash', [PROMOTE_SCRIPT], { stdio: 'inherit' });
  if (result.status !== 0) {
    saveConfig({ ...config, lastPromoteErrorAt: new Date().toISOString(), status: config.status ?? 'staged' });
    process.exit(result.status ?? 1);
  }

  process.exit(0);
}

main();
