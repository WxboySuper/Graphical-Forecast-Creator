import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`^concurrency:\\r?\\n  group: ${queueGroup}\\r?\\n  queue: max$`, 'm'), `${file} must join the shared queue`);
    assert.doesNotMatch(source, /^  cancel-in-progress: true$/m, `${file} must not cancel a running invocation`);
  }
});
