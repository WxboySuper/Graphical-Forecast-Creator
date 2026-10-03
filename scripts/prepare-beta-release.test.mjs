import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = join(dirname(fileURLToPath(import.meta.url)), 'prepare-beta-release.mjs');

const fixtureChangelog = `# Changelog

## [Unreleased]

### Next major / beta

#### Added

- **Feature:** User-visible beta work.

### Stable 1.7.x hotfixes

#### Fixed

<!-- The lane is empty after v1.7.7. -->

## v1.7.7

### Fixed

- **Older:** Prior stable entry.
`;

test('prepare-beta-release bumps package.json only and leaves CHANGELOG structure intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gfc-beta-release-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), fixtureChangelog);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'gfc', version: '1.8.0-beta.4', private: true }, null, 2)}\n`);

  execFileSync('node', [scriptRoot, '1.8.0-beta.5'], {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, NODE_OPTIONS: '' },
    shell: false,
  });

  const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /### Next major \/ beta/);
  assert.match(changelog, /### Stable 1\.7\.x hotfixes/);
  assert.doesNotMatch(changelog, /## v1\.8\.0-beta\.5/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '1.8.0-beta.5');
});
