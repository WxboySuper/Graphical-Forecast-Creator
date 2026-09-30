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
const TARGET_REF_PATTERN = /^(?:[\w./-]+|[0-9a-f]{40})$/;
export const RELEASE_NOTES_MODES = ['changelog', 'prs', 'changelog-and-prs'];

/** Build the GitHub CLI arguments for a release and its portable Markdown notes asset. */
export const buildGitHubReleaseCreateArgs = ({
  tag, targetRef, notesFile, prerelease, draft = false, verifyTag = false,
}) => [
  'release',
  'create',
  tag,
  `${notesFile}#GFC-${tag}-release-notes.md`,
  '--title',
  tag,
  '--notes-file',
  notesFile,
  '--target',
  targetRef,
  ...(prerelease ? ['--prerelease'] : []),
  ...(draft ? ['--draft'] : []),
  ...(verifyTag ? ['--verify-tag'] : []),
];

export const buildGitHubReleasePublishArgs = ({ tag }) => [
  'release',
  'edit',
  tag,
  '--draft=false',
];

/** Build an additive upload command for a release created before notes assets were added. */
export const buildGitHubReleaseUploadArgs = ({ tag, notesFile }) => [
  'release',
  'upload',
  tag,
  `${notesFile}#GFC-${tag}-release-notes.md`,
];

const runGitHubCommand = (args, options) => execFileSync('gh', args, options);

const githubReleaseExists = (tag, runCommand) => {
  try {
    runCommand(['release', 'view', tag], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const githubReleaseHasNotesAsset = (tag, runCommand) => {
  const release = JSON.parse(runCommand(['release', 'view', tag, '--json', 'assets'], { encoding: 'utf8' }));
  return release.assets.some((asset) => asset.name === `GFC-${tag}-release-notes.md`);
};

const uploadReleaseNotesAssetIfMissing = ({ tag, notesFile, runCommand }) => {
  if (githubReleaseHasNotesAsset(tag, runCommand)) return;
  runCommand(buildGitHubReleaseUploadArgs({ tag, notesFile }), { stdio: 'inherit' });
};

/** Publish the generated public release body with a portable Markdown notes asset. */
export const publishGitHubRelease = ({
  tag, targetRef, notesFile, prerelease, draft = false, verifyTag = false, runCommand = runGitHubCommand,
}) => {
  if (githubReleaseExists(tag, runCommand)) {
    uploadReleaseNotesAssetIfMissing({ tag, notesFile, runCommand });
    return `GitHub release ${tag} already exists.`;
  }
  runCommand(buildGitHubReleaseCreateArgs({
    tag, targetRef, notesFile, prerelease, draft, verifyTag,
  }), { stdio: 'inherit' });
  const draftLabel = draft ? ' (draft)' : '';
  return `Created GitHub release ${tag}${prerelease ? ' (prerelease)' : ''}${draftLabel}.`;
};

export const finalizeGitHubRelease = ({ tag, runCommand = runGitHubCommand }) => {
  runCommand(buildGitHubReleasePublishArgs({ tag }), { stdio: 'inherit' });
  return `Published GitHub release ${tag}.`;
};

/** Validate the user-provided release version and target ref. */
export const validateReleaseInputs = ({ version, targetRef }) => {
  if (!version || !VERSION_PATTERN.test(version)) {
    throw new Error('Usage: node scripts/create-github-release.mjs <semver-version> [target-ref]');
  }
  if (!TARGET_REF_PATTERN.test(targetRef)) {
    throw new Error(`Invalid target ref: ${targetRef}`);
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
  if (process.argv[2] === 'finalize') {
    runFinalizeGitHubRelease();
    return;
  }
  const version = process.argv[2];
  const targetRef = process.argv[3] ?? 'main';

  try {
    validateReleaseInputs({ version, targetRef });
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
        targetBranch: targetRef,
        previousTag,
        configurationPath: '.github/release.yml',
      });
      console.log(`Generated GitHub PR notes from ${previousTag ?? 'repository history'}.`);
    } catch (error) {
      if (mode === 'prs') throw error;
      console.warn(`GitHub PR note generation failed; continuing with curated notes: ${error.message}`);
    }
  }

  const changelogUrl = `https://github.com/${repository}/blob/main/${changelogPath}`;
  const section = buildReleaseNotes({ mode, curatedNotes, generatedNotes, changelogUrl });
  const notesFile = process.env.NOTES_FILE ?? 'release-notes.md';
  writeFileSync(notesFile, `${section}\n`);

  const prerelease = hasBetaPrerelease(version);
  if (process.env.DRY_RUN === 'true') {
    console.log(`Dry run: would publish GitHub release ${tag}${prerelease ? ' (prerelease)' : ''}.`);
    console.log(section);
    return;
  }
  const draft = process.env.RELEASE_DRAFT === 'true';
  const verifyTag = process.env.RELEASE_VERIFY_TAG === 'true';
  console.log(publishGitHubRelease({
    tag, targetRef, notesFile, prerelease, draft, verifyTag,
  }));
};

export const runFinalizeGitHubRelease = () => {
  const version = process.argv[3];
  if (!version || !VERSION_PATTERN.test(version)) {
    console.error('Usage: node scripts/create-github-release.mjs finalize <semver-version>');
    process.exit(1);
  }
  const tag = `v${version}`;
  if (process.env.DRY_RUN === 'true') {
    console.log(`Dry run: would publish draft GitHub release ${tag}.`);
    return;
  }
  console.log(finalizeGitHubRelease({ tag }));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
