import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { moveLaneToReleaseSection } from './lib/changelog-lanes.mjs';
import { decideStableReleaseVersion } from './lib/stable-release-version.mjs';

const tagExists = process.argv.includes('--tag-exists');
const dryRun = process.argv.includes('--dry-run');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const currentVersion = packageJson.version;
const decision = decideStableReleaseVersion({ currentVersion, tagExists });
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const laneDecision = moveLaneToReleaseSection(changelog, decision.version, 'stable-hotfix');

if (!dryRun) {
  packageJson.version = decision.version;
  writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  if (laneDecision.moved) writeFileSync('CHANGELOG.md', laneDecision.changelog);
}

const output = process.env.GITHUB_OUTPUT;
if (output) {
  appendFileSync(output, `version=${decision.version}\nstrategy=${decision.strategy}\nbump=${decision.bump}\nchangelog_moved=${laneDecision.moved}\n`);
}
console.log(`Current version: ${currentVersion}`);
console.log(`Target version: ${decision.version}`);
console.log(`Would bump package version: ${decision.bump}`);
console.log(`Would move changelog lane: ${laneDecision.moved}`);
if (dryRun) console.log('Dry run complete. No files changed and no release was created.');
