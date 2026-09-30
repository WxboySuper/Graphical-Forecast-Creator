import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCuratedNotes,
  buildReleaseNotes,
  buildGitHubReleaseCreateArgs,
  buildGitHubReleaseUploadArgs,
  publishGitHubRelease,
  resolvePreviousTag,
  validateReleaseInputs,
} from './create-github-release.mjs';

const releases = [
  { tagName: 'v1.6.6', isPrerelease: false },
  { tagName: 'v1.7.0-beta.8', isPrerelease: true },
  { tagName: 'v1.7.0-beta.9', isPrerelease: true },
];

test('validates release version and target ref inputs', () => {
  assert.doesNotThrow(() => validateReleaseInputs({ version: '1.7.0-beta.1', targetBranch: 'main' }));
  assert.throws(() => validateReleaseInputs({ version: 'latest', targetBranch: 'main' }), /Usage:/);
  assert.throws(() => validateReleaseInputs({ version: '1.7.0', targetBranch: 'bad ref' }), /Invalid target branch/);
});

test('skips release lookup for curated-only notes', () => {
  assert.equal(resolvePreviousTag({
    mode: 'changelog',
    version: '1.7.0',
    repository: 'example/repo',
    releases,
  }), null);
});

test('honors an explicit previous release tag', () => {
  assert.equal(resolvePreviousTag({
    mode: 'prs',
    explicitPreviousTag: 'v1.6.6',
    version: '1.7.0',
    repository: 'example/repo',
    releases,
  }), 'v1.6.6');
});

test('builds curated notes through the selected changelog lane', () => {
  const notes = buildCuratedNotes({
    changelog: '## [Unreleased]\n\n- Beta improvement.',
    version: '1.7.0-beta.1',
    lane: 'next-major',
  });
  assert.match(notes, /Beta improvement/);
});

test('composes the final release body from curated and generated notes', () => {
  const notes = buildReleaseNotes({
    mode: 'changelog-and-prs',
    curatedNotes: '## v1.6.7\n\n- Stable fix.',
    generatedNotes: '## What\'s Changed\n\n- #123 Fix',
    changelogUrl: 'https://github.com/example/repo/blob/main/CHANGELOG.md',
  });
  assert.match(notes, /Stable fix/);
  assert.match(notes, /#123 Fix/);
});

test('publishes the generated Markdown notes with every GitHub release', () => {
  const args = buildGitHubReleaseCreateArgs({
    tag: 'v1.7.0-beta.2',
    targetBranch: 'main',
    notesFile: 'beta-release-notes.md',
    prerelease: true,
  });
  assert.ok(args.includes('beta-release-notes.md#GFC-v1.7.0-beta.2-release-notes.md'));
  assert.ok(args.includes('--notes-file'));
  assert.ok(args.includes('--prerelease'));
  assert.deepEqual(buildGitHubReleaseUploadArgs({ tag: 'v1.6.7', notesFile: 'stable-release-notes.md' }), [
    'release', 'upload', 'v1.6.7', 'stable-release-notes.md#GFC-v1.6.7-release-notes.md',
  ]);
});

test('dry run writes notes without publishing', () => {
  const changelog = '## [Unreleased]\n\n### Next major / beta\n\n#### Added\n- Beta item.\n';
  const notes = buildReleaseNotes({
    mode: 'changelog',
    curatedNotes: buildCuratedNotes({ changelog, version: '1.8.0-beta.1', lane: 'next-major' }),
    generatedNotes: '',
    changelogUrl: 'https://github.com/example/repo/blob/main/CHANGELOG.md',
  });
  assert.match(notes, /Beta item/);
});

test('adds the portable notes asset to an existing release', () => {
  const commands = [];
  const runCommand = (args) => {
    commands.push(args);
    if (args.length === 3 && args[1] === 'view') return '';
    if (args.includes('--json')) return JSON.stringify({ assets: [] });
    return '';
  };
  const result = publishGitHubRelease({
    tag: 'v1.6.7', targetBranch: 'stable/1.6.x', notesFile: 'stable-release-notes.md', prerelease: false, runCommand,
  });
  assert.equal(result, 'GitHub release v1.6.7 already exists.');
  assert.deepEqual(commands.at(-1), buildGitHubReleaseUploadArgs({ tag: 'v1.6.7', notesFile: 'stable-release-notes.md' }));
});

test('creates a release and attaches the same generated notes used for its public description', () => {
  const commands = [];
  const result = publishGitHubRelease({
    tag: 'v1.7.0-beta.2', targetBranch: 'main', notesFile: 'beta-release-notes.md', prerelease: true,
    runCommand: (args) => {
      commands.push(args);
      if (args.length === 3 && args[1] === 'view') throw new Error('release not found');
      return '';
    },
  });
  assert.equal(result, 'Created GitHub release v1.7.0-beta.2 (prerelease).');
  assert.deepEqual(commands.at(-1), buildGitHubReleaseCreateArgs({
    tag: 'v1.7.0-beta.2', targetBranch: 'main', notesFile: 'beta-release-notes.md', prerelease: true,
  }));
});
