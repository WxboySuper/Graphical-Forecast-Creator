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
