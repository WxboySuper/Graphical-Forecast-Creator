import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readFileSync as readRepoFile } from 'node:fs';

test('writes the package version as JSON for deployment smoke checks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gfc-version-'));
  const outputPath = join(directory, 'version.json');
  try {
    const result = spawnSync(process.execPath, ['scripts/write-version.mjs', outputPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const expectedVersion = JSON.parse(readRepoFile('package.json', 'utf8')).version;
    assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), { version: expectedVersion });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
