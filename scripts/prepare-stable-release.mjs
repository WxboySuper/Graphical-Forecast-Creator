import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { moveLaneToReleaseSection } from './lib/changelog-lanes.mjs';
import { decideStableReleaseVersion, updateProductionReleaseManifest } from './lib/stable-release-version.mjs';

const MANIFEST_PATH = 'deploy/production-release.json';
const tagExists = process.argv.includes('--tag-exists');
const dryRun = process.argv.includes('--dry-run');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const currentVersion = packageJson.version;
const decision = decideStableReleaseVersion({ currentVersion, tagExists });
const changelog = readFileSync('CHANGELOG.md', 'utf8');
let laneDecision;
try {
  laneDecision = moveLaneToReleaseSection(changelog, decision.version, 'stable-hotfix');
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const nextManifest = updateProductionReleaseManifest(manifest, decision.version);
const manifestChanged = JSON.stringify(nextManifest) !== JSON.stringify(manifest);

if (!dryRun) {
  packageJson.version = decision.version;
  writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  if (laneDecision.moved) writeFileSync('CHANGELOG.md', laneDecision.changelog);
  // The deploy validates that the manifest version matches package.json, so the manifest moves with it.
  if (manifestChanged) writeFileSync(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`);
}

const output = process.env.GITHUB_OUTPUT;
if (output) {
  appendFileSync(output, `version=${decision.version}\nstrategy=${decision.strategy}\nbump=${decision.bump}\nchangelog_moved=${laneDecision.moved}\nmanifest_updated=${manifestChanged}\n`);
}
console.log(`Current version: ${currentVersion}`);
console.log(`Target version: ${decision.version}`);
console.log(`Would bump package version: ${decision.bump}`);
console.log(`Would move changelog lane: ${laneDecision.moved}`);
console.log(`Would update ${MANIFEST_PATH}: ${manifestChanged}`);
if (dryRun) console.log('Dry run complete. No files changed and no release was created.');
