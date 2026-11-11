import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/deploy-main-to-vps.yml', import.meta.url), 'utf8');

test('manual rollback to a pre-Worker tag can write the version marker without Worker scripts', () => {
  assert.match(workflow, /if \[ -f scripts\/write-version\.mjs \]; then[\s\S]*?else\s+node -e [^\n]*build\/version\.json/);
});

test('manual rollback to a pre-Worker tag skips Worker-only alert generation and deployment', () => {
  const alertStep = workflow.match(/- name: Write derived production alert banner([\s\S]*?)(?=\n {6}- name:)/)?.[1];
  const workerStep = workflow.match(/- name: Deploy production Worker frontend([\s\S]*?)(?=\n {6}- name:)/)?.[1];
  const smokeStep = workflow.match(/- name: Smoke test production Worker frontend and API([\s\S]*?)(?=\n\s*$)/)?.[1];

  assert.ok(alertStep, 'production alert step must exist');
  assert.match(alertStep, /github\.event_name == 'release' \|\| inputs\.deploy_worker/);
  assert.match(alertStep, /if \[ -f scripts\/write-derived-alert-banner\.mjs \]; then/);
  assert.ok(workerStep, 'production Worker deploy step must exist');
  assert.match(workerStep, /github\.event_name == 'release' \|\| inputs\.deploy_worker/);
  assert.ok(smokeStep, 'production Worker smoke step must exist');
  assert.match(smokeStep, /github\.event_name == 'release' \|\| inputs\.deploy_worker/);
});

test('production dispatch accepts flat stable branches and padded stable tags only', () => {
  const refValidation = workflow.split('\n').find((line) => line.includes('GHA_INPUT_REF') && line.includes('grep -Eq'));
  const pattern = refValidation?.match(/grep -Eq '([^']+)'/)?.[1];
  assert.ok(pattern, 'production ref validation pattern must exist');
  const accepts = (ref) => new RegExp(pattern).test(ref);

  assert.equal(accepts('stable/2.x'), true);
  assert.equal(accepts('stable/2.1.x'), true);
  assert.equal(accepts('v2.0.0'), true);
  assert.equal(accepts('v2.0.0-beta.16'), false);
});
