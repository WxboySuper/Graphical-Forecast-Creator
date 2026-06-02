#!/usr/bin/env node
/**
 * VPS cron entry: promote staged release when rolloutAt has passed.
 * Invoked from /etc/cron.d/gfc-rollout via promote-release.sh.
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

/**
 * Reads the VPS production-release.json manifest.
 * @returns {{ config: ReturnType<typeof normalizeProductionReleaseConfig>, raw: Record<string, unknown> }}
 */
function loadConfig() {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return { config: normalizeProductionReleaseConfig(raw), raw };
}

/**
 * Writes manifest updates after a failed promote attempt, preserving extra VPS fields.
 * @param {ReturnType<typeof normalizeProductionReleaseConfig>} config Normalized manifest fields to merge.
 * @param {Record<string, unknown>} raw Original JSON from disk (e.g. stagedAt).
 */
function saveConfig(config, raw) {
  const merged = raw ? { ...raw, ...config } : config;
  writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

/**
 * Returns true when cron should not attempt promotion for this manifest.
 * @param {ReturnType<typeof normalizeProductionReleaseConfig>} config
 * @returns {boolean}
 */
function shouldSkipRollout(config) {
  const inactiveStatus = config.status === 'live' || config.status === 'cancelled';
  const unknownStatus = config.status !== 'scheduled' && config.status !== 'staged';
  return config.action !== 'stage' || inactiveStatus || unknownStatus;
}

/**
 * Returns true when rolloutAt has passed and promotion may proceed.
 * @param {ReturnType<typeof normalizeProductionReleaseConfig>} config
 * @returns {boolean}
 */
function isRolloutDue(config) {
  const rolloutAtMs = parseInstant(config.rolloutAt);
  if (rolloutAtMs === null) {
    console.error('[rollout] missing rolloutAt');
    process.exit(1);
  }
  return Date.now() >= rolloutAtMs;
}

/**
 * Cron entry point: promote when rolloutAt has passed.
 */
function main() {
  /** @type {ReturnType<typeof normalizeProductionReleaseConfig>} */
  let config;
  /** @type {Record<string, unknown>} */
  let raw = {};
  try {
    ({ config, raw } = loadConfig());
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
    saveConfig(
      { ...config, lastPromoteErrorAt: new Date().toISOString(), status: config.status ?? 'staged' },
      raw,
    );
    process.exit(result.status ?? 1);
  }

  process.exit(0);
}

main();
