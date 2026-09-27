import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { extractReleaseNotes } from './lib/changelog.mjs';
import { hasBetaPrerelease } from './lib/package-version.mjs';
import {
  composeReleaseNotes,
  generateGitHubReleaseNotes,
  listGitHubReleases,
  selectPreviousReleaseTag,
} from './lib/release-notes.mjs';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/;
const BRANCH_PATTERN = /^[\w./-]+$/;
export const RELEASE_NOTES_MODES = ['changelog', 'prs', 'changelog-and-prs'];

/** Build the GitHub CLI arguments for a release and its portable Markdown notes asset. */
export const buildGitHubReleaseCreateArgs = ({ tag, targetBranch, notesFile, prerelease }) => [
  'release',
  'create',
  tag,
  `${notesFile}#GFC-${tag}-release-notes.md`,
  '--title',
  tag,
  '--notes-file',
  notesFile,
  '--target',
  targetBranch,
  ...(prerelease ? ['--prerelease'] : []),
];

/** Build an additive upload command for a release created before notes assets were added. */
export const buildGitHubReleaseUploadArgs = ({ tag, notesFile }) => [
  'release',
  'upload',
  tag,
  `${notesFile}#GFC-${tag}-release-notes.md`,
];

/** Validate the user-provided release version and target ref. */
export const validateReleaseInputs = ({ version, targetBranch }) => {
  if (!version || !VERSION_PATTERN.test(version)) {
    throw new Error('Usage: node scripts/create-github-release.mjs <semver-version> [target-branch]');
  }
  if (!BRANCH_PATTERN.test(targetBranch)) {
    throw new Error(`Invalid target branch: ${targetBranch}`);
  }
};

/** Resolve the release immediately preceding this release, unless notes are curated-only. */
export const resolvePreviousTag = ({ mode, explicitPreviousTag = '', version, repository, releases }) => {
  const requestedTag = explicitPreviousTag.trim();
  if (requestedTag) return requestedTag;
  if (mode === 'changelog') return null;
  return selectPreviousReleaseTag({
    version,
    releases: releases ?? listGitHubReleases(repository),
  });
};

/** Extract the curated changelog section for the release lane. */
export const buildCuratedNotes = ({ changelog, version, lane }) =>
  extractReleaseNotes(changelog, version, lane) ??
  `## v${version}\n\nRelease for package version ${version}.`;

/** Compose the final GitHub Release body from curated and generated notes. */
export const buildReleaseNotes = ({ mode, curatedNotes, generatedNotes, changelogUrl }) =>
  composeReleaseNotes({ mode, curatedNotes, generatedNotes, changelogUrl });

/** Execute the release workflow using the current process arguments and environment. */
const run = () => {
  const version = process.argv[2];
  const targetBranch = process.argv[3] ?? 'main';

  try {
    validateReleaseInputs({ version, targetBranch });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const changelogPath = process.env.CHANGELOG_FILE ?? 'CHANGELOG.md';
  const changelog = readFileSync(changelogPath, 'utf8');
  const lane = process.env.CHANGELOG_LANE ?? '';
  const curatedNotes = buildCuratedNotes({ changelog, version, lane });

  const mode = process.env.RELEASE_NOTES_MODE ?? 'changelog';
  if (!RELEASE_NOTES_MODES.includes(mode)) {
    console.error(`Invalid RELEASE_NOTES_MODE: ${mode}`);
    process.exit(1);
  }

  const repository = process.env.GITHUB_REPOSITORY ?? execFileSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    { encoding: 'utf8' },
  ).trim();
  const tag = `v${version}`;
  const previousTag = resolvePreviousTag({
    mode,
    explicitPreviousTag: process.env.PREVIOUS_TAG,
    version,
    repository,
  });
  let generatedNotes = '';

  if (mode !== 'changelog') {
    try {
      generatedNotes = generateGitHubReleaseNotes({
        repository,
        tag,
        targetBranch,
        previousTag,
        configurationPath: '.github/release.yml',
      });
      console.log(`Generated GitHub PR notes from ${previousTag ?? 'repository history'}.`);
    } catch (error) {
      if (mode === 'prs') throw error;
      console.warn(`GitHub PR note generation failed; continuing with curated notes: ${error.message}`);
    }
  }

  const changelogUrl = `https://github.com/${repository}/blob/${targetBranch}/${changelogPath}`;
  const section = buildReleaseNotes({ mode, curatedNotes, generatedNotes, changelogUrl });
  const notesFile = process.env.NOTES_FILE ?? 'release-notes.md';
  writeFileSync(notesFile, `${section}\n`);

  const prerelease = hasBetaPrerelease(version);
  /** Check whether the requested GitHub release already exists. */
  const ghReleaseExists = () => {
    try {
      execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  /** Create the requested GitHub release from the prepared notes file. */
  if (ghReleaseExists()) {
    console.log(`GitHub release ${tag} already exists.`);
    const release = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'assets'], { encoding: 'utf8' }));
    const assetName = `GFC-${tag}-release-notes.md`;
    if (!release.assets.some((asset) => asset.name === assetName)) {
      execFileSync('gh', buildGitHubReleaseUploadArgs({ tag, notesFile }), { stdio: 'inherit' });
    }
  } else {
    execFileSync('gh', buildGitHubReleaseCreateArgs({ tag, targetBranch, notesFile, prerelease }), { stdio: 'inherit' });
    console.log(`Created GitHub release ${tag}${prerelease ? ' (prerelease)' : ''}.`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
