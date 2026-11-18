/**
 * Every workflow that changes production waits for an approval click on the production-promote
 * environment, so nothing (including an agent using the maintainer's gh login) deploys unseen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Normalised so the checks hold for CRLF checkouts as well as LF.
const workflow = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

for (const name of ['deploy-main-to-vps.yml', 'deploy-feedback-worker.yml', 'deploy-telemetry-worker.yml', 'bootstrap-stable-release.yml', 'prepare-stable-promotion.yml']) {
  test(`${name} is gated on production-promote`, () => {
    assert.match(workflow(name), /^\s+environment: production-promote\s*$/m);
  });
}

test('the production deploy gates the release-triggered path too, not only manual runs', () => {
  const deploy = workflow('deploy-main-to-vps.yml');
  assert.match(deploy, /release:\n\s+types:/);
  assert.match(deploy, /\n {2}deploy:\n[\s\S]*?\n {4}environment: production-promote\n/);
});
