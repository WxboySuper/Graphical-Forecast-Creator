import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'yaml';

const workflowFiles = [
  '../../.github/workflows/opencode.yml',
  '../../.github/workflows/opencode-first-look.yml',
  '../../.github/workflows/opencode-issue-triage.yml',
  '../../.github/workflows/opencode-scheduled-maintenance.yml',
  '../../.github/workflows/opencode-changelog-audit.yml',
  '../../.github/workflows/opencode-audit-issue-worker.yml',
  '../../.github/workflows/opencode-research.yml',
];
const queueGroup = 'gfc-opencode-maintenance-queue';

test('every OpenCode workflow shares the single bounded concurrency queue', () => {
  for (const file of workflowFiles) {
    const workflow = yaml.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
    assert.equal(workflow.concurrency?.group, queueGroup, `${file} must join the shared queue`);
    assert.equal(workflow.concurrency?.queue, 'max', `${file} must retain pending work in the queue`);
    assert.notEqual(workflow.concurrency?.['cancel-in-progress'], true, `${file} must not cancel a running invocation`);
  }
});
