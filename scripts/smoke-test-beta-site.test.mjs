import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'smoke-test-beta-site.mjs');

/** Spawns the smoke script against a closed local port so it fails without network access. */
const runWithEnv = (env) =>
  spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BETA_ORIGIN: 'http://127.0.0.1:1',
      SMOKE_RETRY_DELAY_MS: '1',
      ...env,
    },
    timeout: 30_000,
  });

test('invalid SMOKE_ATTEMPTS falls back to the default instead of NaN', () => {
  const result = runWithEnv({ SMOKE_ATTEMPTS: 'abc' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Smoke test failed after 6 attempts/);
  assert.doesNotMatch(result.stderr, /NaN/);
});

test('zero SMOKE_ATTEMPTS falls back to the default instead of skipping the retry loop', () => {
  const result = runWithEnv({ SMOKE_ATTEMPTS: '0' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Smoke test failed after 6 attempts/);
  assert.doesNotMatch(result.stderr, /undefined/);
});
