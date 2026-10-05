import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { maintenanceRunnerLibBasenames } = require('./opencode-maintenance-runner-deps.cjs');

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptsRoot = path.join(repositoryRoot, 'scripts');

test('bug-hunt runner lib closure includes every module imported by run-opencode-maintenance.mjs', () => {
  const basenames = maintenanceRunnerLibBasenames(scriptsRoot);
  assert.deepEqual(basenames, [
    'opencode-cli-output.mjs',
    'opencode-env.cjs',
    'opencode-first-look-output.mjs',
    'opencode-first-look-retry.mjs',
  ]);
});

test('scheduled maintenance copies the full runner lib closure into RUNNER_TEMP', () => {
  const workflow = readFileSync(
    path.join(repositoryRoot, '.github/workflows/opencode-scheduled-maintenance.yml'),
    'utf8',
  );
  assert.match(workflow, /node scripts\/lib\/opencode-maintenance-runner-deps\.cjs/);
  assert.match(workflow, /cp "scripts\/lib\/\$\{libFile\}" "\$RUNNER_TEMP\/lib\/"/);
});
