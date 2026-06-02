#!/usr/bin/env node
/**
 * Updates production-release.json on the VPS after a successful stage deploy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeProductionReleaseConfig } from '../lib/production-release.mjs';

const configPath = process.env.CONFIG_PATH || '/opt/gfc-analytics/config/production-release.json';

const raw = JSON.parse(readFileSync(configPath, 'utf8'));
const config = normalizeProductionReleaseConfig(raw);

if (config.action !== 'stage') {
  console.error('[rollout] mark-release-staged: manifest action is not "stage"');
  process.exit(1);
}

const next = {
  ...raw,
  ...config,
  status: 'staged',
  stagedAt: new Date().toISOString(),
};

writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`[rollout] marked ${config.releaseId} as staged`);
