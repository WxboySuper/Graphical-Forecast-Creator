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
  assert.deepEqual(basenames, ['opencode-cli-output.mjs', 'opencode-env.cjs']);
});

test('shared maintenance runner does not import first-look repair modules', () => {
  const source = readFileSync(path.join(scriptsRoot, 'run-opencode-maintenance.mjs'), 'utf8');
  assert.doesNotMatch(source, /opencode-first-look/);
});
