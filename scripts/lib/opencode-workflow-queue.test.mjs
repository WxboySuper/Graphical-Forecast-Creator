import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowFiles = [
  '../../.github/workflows/opencode.yml',
  '../../.github/workflows/opencode-issue-triage.yml',
  '../../.github/workflows/opencode-changelog-audit.yml',
  '../../.github/workflows/opencode-changelog-pr.yml',
];
// Maintenance automations below migrated completely to T3 scheduled tasks
// (GFC Report contract); the workflows must stay deleted.
const migratedWorkflows = [
  '../../.github/workflows/opencode-scheduled-maintenance.yml',
  '../../.github/workflows/opencode-audit-issue-worker.yml',
  '../../.github/workflows/opencode-research.yml',
];
const queueGroup = 'gfc-opencode-maintenance-queue';

test('OpenCode workflows use the shared queue', () => {
  for (const workflowFile of workflowFiles) {
    const source = readFileSync(new URL(workflowFile, import.meta.url), 'utf8');
    assert.match(
      source,
      new RegExp(`^concurrency:\\r?\\n[ ]{2}group: ${queueGroup}\\r?\\n[ ]{2}queue: max$`, 'm'),
      `${workflowFile} must join the shared queue`,
    );
    assert.doesNotMatch(source, /^[ ]{2}cancel-in-progress: true$/m, `${workflowFile} must not cancel a running invocation`);
  }

});

test('changelog audit keeps runner context references at step scope', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/opencode-changelog-audit.yml', import.meta.url), 'utf8');
  const jobEnv = workflow.match(/^[ ]{4}env:\r?\n([\s\S]*?)^[ ]{4}steps:/m)?.[1] ?? '';
  assert.doesNotMatch(jobEnv, /runner\.temp/, 'runner context is unavailable in job-level env');
});

test('migrated maintenance workflows stay deleted because T3 is the sole runner', () => {
  for (const workflowFile of migratedWorkflows) {
    assert.throws(
      () => readFileSync(new URL(workflowFile, import.meta.url), 'utf8'),
      /ENOENT/,
      `${workflowFile} must stay deleted: T3 scheduled tasks own this automation`,
    );
  }
});
