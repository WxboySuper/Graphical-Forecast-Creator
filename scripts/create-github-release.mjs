import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extractReleaseNotes } from './lib/changelog.mjs';
import { hasBetaPrerelease } from './lib/package-version.mjs';

const version = process.argv[2];
const targetBranch = process.argv[3] ?? 'main';

if (!version) {
  console.error('Usage: node scripts/create-github-release.mjs <version> [target-branch]');
  process.exit(1);
}

const changelogPath = process.env.CHANGELOG_FILE ?? 'CHANGELOG.md';
const changelog = readFileSync(changelogPath, 'utf8');
const section =
  extractReleaseNotes(changelog, version) ??
  `## v${version}\n\nRelease for package version ${version}.`;

const notesFile = process.env.NOTES_FILE ?? 'release-notes.md';
writeFileSync(notesFile, `${section}\n`);

const tag = `v${version}`;
const prereleaseFlag = hasBetaPrerelease(version) ? '--prerelease' : '';

try {
  execSync(`gh release view "${tag}"`, { stdio: 'ignore' });
  console.log(`GitHub release ${tag} already exists.`);
} catch {
  const prereleaseSuffix = prereleaseFlag ? ` ${prereleaseFlag}` : '';
  execSync(
    `gh release create "${tag}" --title "${tag}" --notes-file "${notesFile}" --target "${targetBranch}"${prereleaseSuffix}`,
    { stdio: 'inherit' },
  );
  console.log(`Created GitHub release ${tag}${prereleaseFlag ? ' (prerelease)' : ''}.`);
}
