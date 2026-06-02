import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveStableVersion } from './lib/package-version.mjs';
import {
  normalizeProductionReleaseConfig,
  validateProductionReleaseForDeploy,
} from '../server/lib/production-release.mjs';

const manifestPath = resolve('deploy/production-release.json');
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const expectedVersion = deriveStableVersion(packageVersion) ?? packageVersion;
const deployAction = process.env.DEPLOY_ACTION?.trim() || '';
const force = process.env.DEPLOY_FORCE === 'true';
const previousReleaseId = process.env.PREVIOUS_RELEASE_ID?.trim() || '';

let raw;
try {
  raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Missing or invalid ${manifestPath}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}

const config = normalizeProductionReleaseConfig(raw);
const action = deployAction || config.action;

const result = validateProductionReleaseForDeploy({
  config,
  packageVersion: expectedVersion,
  deployAction: action,
  force,
  previousReleaseId,
});

if (!result.ok) {
  console.error('Production release manifest validation failed:');
  for (const message of result.errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(
  `production-release.json ok (releaseId=${config.releaseId}, action=${action}, version=${config.version})`,
);
