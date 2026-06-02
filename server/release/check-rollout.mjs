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

/** Reads and normalizes the VPS production release manifest. */
function loadConfig() {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return { config: normalizeProductionReleaseConfig(raw), raw };
}

/** Persists manifest updates after a failed promote attempt. */
function saveConfig(config, raw) {
  const merged = raw ? { ...raw, ...config } : config;
  writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

/** @param {ReturnType<typeof normalizeProductionReleaseConfig>} config */
function shouldSkipRollout(config) {
  const inactiveStatus = config.status === 'live' || config.status === 'cancelled';
  const unknownStatus = config.status !== 'scheduled' && config.status !== 'staged';
  return config.action !== 'stage' || inactiveStatus || unknownStatus;
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

/** Loads config or exits when the manifest cannot be read. */
function loadConfigOrExit() {
  try {
    return loadConfig();
  } catch (error) {
    console.error('[rollout] unable to read config:', error);
    process.exit(1);
  }
}

/** Cron entry: promote when rolloutAt has passed. */
function main() {
  const loaded = loadConfigOrExit();
  if (!loaded) {
    return;
  }
  const { config, raw } = loaded;

  if (shouldSkipRollout(config)) {
    process.exit(0);
  }

  if (!isRolloutDue(config)) {
    process.exit(0);
  }

  console.log(`[rollout] promoting ${config.version} (${config.releaseId})`);

  const result = spawnSync('bash', [PROMOTE_SCRIPT], { stdio: 'inherit' });
  if (result.status !== 0) {
    saveConfig(
      { ...config, lastPromoteErrorAt: new Date().toISOString(), status: config.status ?? 'staged' },
      raw,
    );
    process.exit(result.status ?? 1);
  }

  process.exit(0);
}

main();
