import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateChangelogReleaseGate } from './opencode-changelog-release-gate.mjs';

const head = 'a'.repeat(40);

test('release gate accepts only a clean audit for a valid audited target revision', () => {
  assert.deepEqual(evaluateChangelogReleaseGate({
    auditResult: 'success', auditStatus: 'clean', targetRef: 'main', auditedHead: head,
  }), { ready: true, message: `Changelog is clean for main@${head}.` });
  for (const status of ['pr-opened', 'inconclusive', 'running', undefined]) {
    assert.equal(evaluateChangelogReleaseGate({
      auditResult: 'success', auditStatus: status, targetRef: 'main', auditedHead: head,
    }).ready, false);
  }
  assert.equal(evaluateChangelogReleaseGate({
    auditResult: 'failure', auditStatus: undefined, targetRef: 'main', auditedHead: head,
  }).ready, false);
  assert.equal(evaluateChangelogReleaseGate({
    auditResult: 'success', auditStatus: 'clean', targetRef: 'feature/test', auditedHead: head,
  }).ready, false);
  assert.equal(evaluateChangelogReleaseGate({
    auditResult: 'success', auditStatus: 'clean', targetRef: 'stable/1.6.x', auditedHead: 'stale',
  }).ready, false);
});

test('beta and stable release jobs require a clean final audit before creating releases', () => {
  for (const filename of ['../../.github/workflows/release-beta.yml', '../../.github/workflows/release-stable.yml']) {
    const workflow = readFileSync(new URL(filename, import.meta.url), 'utf8');
    assert.match(workflow, /final_changelog_audit:[\s\S]*?uses: \.\/\.github\/workflows\/opencode-changelog-audit\.yml/);
    assert.match(workflow, /changelog_gate:[\s\S]*?require-opencode-changelog-clean\.mjs/);
    assert.match(workflow, /AUDITED_HEAD:[\s\S]*?needs\.final_changelog_audit\.outputs\.head_sha/);
    assert.doesNotMatch(workflow, /Dispatch post-release changelog audit/);
    assert.match(workflow, /RELEASE_NOTES_MODE: changelog-and-prs/);
  }
  const beta = readFileSync(new URL('../../.github/workflows/release-beta.yml', import.meta.url), 'utf8');
  assert.match(beta, /needs: \[quality, final_changelog_audit, changelog_gate\]/);
  assert.match(beta, /needs: \[version_gate, pre_build\]/);
  const stable = readFileSync(new URL('../../.github/workflows/release-stable.yml', import.meta.url), 'utf8');
  assert.match(stable, /needs: \[final_changelog_audit, changelog_gate\]/);
});

test('beta release deploys the Worker and VPS API without rsyncing the retired frontend', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release-beta.yml', import.meta.url), 'utf8');
  assert.match(workflow, /wrangler\.beta\.jsonc/);
  assert.match(workflow, /smoke-test-beta-site\.mjs/);
  assert.match(workflow, /gfc-beta-analytics/);
  assert.doesNotMatch(workflow, /\/var\/www\/gfc-beta/);
});

test('reusable changelog audit exports status and audited head and reads target source with trusted tools', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/opencode-changelog-audit.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_call:[\s\S]*?outputs:[\s\S]*?status:[\s\S]*?jobs\.audit\.outputs\.status/);
  assert.match(workflow, /head_sha:[\s\S]*?jobs\.audit\.outputs\.head_sha/);
  assert.match(workflow, /path: target-source/);
  assert.match(workflow, /SOURCE_PATH: \$\{\{ github\.workspace \}\}\/target-source/);
  assert.match(workflow, /working-directory: target-source[\s\S]*?prepare-opencode-changelog-audit\.mjs/);
});
