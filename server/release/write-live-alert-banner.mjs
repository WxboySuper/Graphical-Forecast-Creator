#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveAlertBannerFile,
  normalizeProductionReleaseConfig,
} from '../lib/production-release.mjs';

function parseArgs(argv) {
  const options = { config: '', webRoot: '' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--config') {
      options.config = argv[i + 1] ?? '';
      i += 1;
    } else if (argv[i] === '--web-root') {
      options.webRoot = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return options;
}

const { config: configPath, webRoot } = parseArgs(process.argv);
if (!configPath || !webRoot) {
  console.error('Usage: write-live-alert-banner.mjs --config <path> --web-root <dir>');
  process.exit(1);
}

const config = normalizeProductionReleaseConfig(JSON.parse(readFileSync(configPath, 'utf8')));
const banner = deriveAlertBannerFile(config, { surface: 'live' });
const outputPath = join(webRoot, 'alert-banner.json');

writeFileSync(outputPath, `${JSON.stringify(banner, null, 2)}\n`, 'utf8');
console.log(`[rollout] wrote ${outputPath}`);
