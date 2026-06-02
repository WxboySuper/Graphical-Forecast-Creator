import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveAlertBannerFile,
  normalizeProductionReleaseConfig,
} from '../server/lib/production-release.mjs';

const manifestPath = resolve('deploy/production-release.json');
const outputPath = resolve(process.env.OUTPUT_PATH || 'build/alert-banner.json');
const surface = process.env.BANNER_SURFACE === 'live-pre-promote' ? 'live-pre-promote' : 'live';

const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
const config = normalizeProductionReleaseConfig(raw);
const banner = deriveAlertBannerFile(config, { surface });

writeFileSync(outputPath, `${JSON.stringify(banner, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath} (surface=${surface})`);
