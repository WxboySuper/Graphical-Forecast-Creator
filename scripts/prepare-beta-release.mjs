import { readFileSync, writeFileSync } from 'node:fs';
import { CHANGELOG_LANE_HEADINGS, findChangelogLaneBounds } from './lib/changelog-lanes.mjs';
import { hasBetaPrerelease } from './lib/package-version.mjs';

const targetVersion = process.argv[2] ?? '';
const dryRun = process.argv.includes('--dry-run');

if (!hasBetaPrerelease(targetVersion)) {
  console.error('Usage: node scripts/prepare-beta-release.mjs <X.Y.Z-beta.N> [--dry-run]');
  process.exit(1);
}

const packageJsonPath = 'package.json';
const changelogPath = 'CHANGELOG.md';
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
packageJson.version = targetVersion;

const changelog = readFileSync(changelogPath, 'utf8');
const lane = 'next-major';
const laneHeading = CHANGELOG_LANE_HEADINGS[lane];
const laneBounds = findChangelogLaneBounds(changelog, lane);
if (!laneBounds) {
  console.error(`CHANGELOG.md must include ${laneHeading}.`);
  process.exit(1);
}

const laneBody = changelog.slice(laneBounds.start + laneBounds.heading.length, laneBounds.end).trim();
if (!laneBody || /No unreleased next-major changes/i.test(laneBody)) {
  console.error('The next-major changelog lane is empty; beta release requires release notes.');
  process.exit(1);
}

const releaseSection = `## v${targetVersion}\n\n${laneBody}\n\n`;
const nextLaneReset = `${laneHeading}\n\n#### Added\n\n<!-- Continue next-major work here after this beta release. -->\n`;
const nextChangelog = `${changelog.slice(0, laneBounds.start)}${releaseSection}${nextLaneReset}${changelog.slice(laneBounds.end).replace(/^\s*/, '')}`;

if (dryRun) {
  console.log(`Would set package.json version to ${targetVersion}`);
  console.log(`Would promote ${laneHeading} to ## v${targetVersion}`);
  process.exit(0);
}

writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(changelogPath, nextChangelog);
console.log(`Prepared beta release ${targetVersion}: package.json and CHANGELOG.md updated.`);
