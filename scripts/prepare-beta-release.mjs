import { readFileSync, writeFileSync } from 'node:fs';
import { validateChangelogLaneForRelease } from './lib/changelog-lane-content.mjs';
import { hasBetaPrerelease } from './lib/package-version.mjs';

const targetVersion = process.argv[2] ?? '';
const dryRun = process.argv.includes('--dry-run');

if (!hasBetaPrerelease(targetVersion)) {
  console.error('Usage: node scripts/prepare-beta-release.mjs <X.Y.Z-beta.N> [--dry-run]');
  process.exit(1);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
validateChangelogLaneForRelease(changelog, 'next-major');

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
packageJson.version = targetVersion;

if (dryRun) {
  console.log(`Would set package.json version to ${targetVersion} (CHANGELOG.md unchanged).`);
  process.exit(0);
}

writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Prepared beta release ${targetVersion}: package.json updated.`);
