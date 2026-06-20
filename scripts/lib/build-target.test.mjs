import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveBuildTarget } from './build-target.mjs';

test('resolves every supported build target', () => {
  for (const target of ['local', 'beta', 'staging', 'production']) {
    assert.equal(resolveBuildTarget(target), target);
  }
});

test('defaults an omitted build target to local', () => {
  assert.equal(resolveBuildTarget(), 'local');
});

test('rejects empty, unknown, or differently-cased targets', () => {
  for (const target of ['', 'preview', 'Production', ' beta ']) {
    assert.throws(() => resolveBuildTarget(target), /Invalid VITE_BUILD_TARGET/);
  }
});

test('hosted workflow builds declare their target explicitly', () => {
  const betaWorkflow = fs.readFileSync('.github/workflows/deploy-beta.yml', 'utf8');
  const productionWorkflow = fs.readFileSync('.github/workflows/deploy-main-to-vps.yml', 'utf8');

  assert.match(betaWorkflow, /VITE_BUILD_TARGET:\s*beta/);
  assert.match(productionWorkflow, /VITE_BUILD_TARGET:\s*production/);
  assert.match(productionWorkflow, /VITE_BUILD_TARGET:\s*staging/);
});
