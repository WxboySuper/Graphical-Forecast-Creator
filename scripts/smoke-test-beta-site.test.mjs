import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
  for (let attempt = 1; attempt < 6; attempt += 1) {
    assert.match(result.stderr, new RegExp(`Smoke attempt ${attempt}/6 failed`));
  }
});

test('zero SMOKE_ATTEMPTS falls back to the default instead of skipping the retry loop', () => {
  const result = runWithEnv({ SMOKE_ATTEMPTS: '0' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Smoke test failed after 6 attempts/);
  assert.doesNotMatch(result.stderr, /undefined/);
  for (let attempt = 1; attempt < 6; attempt += 1) {
    assert.match(result.stderr, new RegExp(`Smoke attempt ${attempt}/6 failed`));
  }
});

test('unsafe attempt counts fall back to six retries', () => {
  const result = runWithEnv({ SMOKE_ATTEMPTS: '9007199254740992' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Smoke attempt 5\/6 failed/);
  assert.match(result.stderr, /Smoke test failed after 6 attempts/);
});

test('an unsupported timer delay falls back to ten seconds', async () => {
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, BETA_ORIGIN: 'http://127.0.0.1:1', SMOKE_ATTEMPTS: '2', SMOKE_RETRY_DELAY_MS: '2147483648' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    const output = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('smoke test did not report its first retry')), 5000);
      child.stderr.once('data', (chunk) => {
        clearTimeout(timeout);
        resolve(chunk.toString());
      });
      child.once('error', reject);
    });
    assert.match(output, /retrying in 10000ms/);
  } finally {
    child.kill();
  }
});
