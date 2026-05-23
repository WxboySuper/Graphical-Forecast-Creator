import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extractChangelogSection } from './lib/changelog.mjs';

const stableVersion = process.argv[2];
const targetBranch = process.argv[3] ?? 'main';

if (!stableVersion) {
  console.error('Usage: node scripts/create-github-release.mjs <stable-version> [target-branch]');
  process.exit(1);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const section = extractChangelogSection(changelog, stableVersion);

if (!section) {
  console.error(`No CHANGELOG section found for v${stableVersion}.`);
  process.exit(1);
}

const notesFile = process.env.NOTES_FILE ?? 'release-notes.md';
writeFileSync(notesFile, `${section}\n`);

const tag = `v${stableVersion}`;
try {
  execSync(`gh release view "${tag}"`, { stdio: 'ignore' });
  console.log(`GitHub release ${tag} already exists.`);
} catch {
  execSync(
    `gh release create "${tag}" --title "${tag}" --notes-file "${notesFile}" --target "${targetBranch}"`,
    { stdio: 'inherit' },
  );
  console.log(`Created GitHub release ${tag}.`);
}
