import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const workflowFiles = [
  '../../.github/workflows/opencode.yml',
  '../../.github/workflows/opencode-first-look.yml',
  '../../.github/workflows/opencode-issue-triage.yml',
  '../../.github/workflows/opencode-scheduled-maintenance.yml',
  '../../.github/workflows/opencode-changelog-audit.yml',
  '../../.github/workflows/opencode-changelog-pr.yml',
  '../../.github/workflows/opencode-audit-issue-worker.yml',
  '../../.github/workflows/opencode-research.yml',
];
const queueGroup = 'gfc-opencode-maintenance-queue';

test('every OpenCode workflow shares the single bounded concurrency queue', () => {
  for (const file of workflowFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(
      source,
      new RegExp(`^concurrency:\\r?\\n[ ]{2}group: ${queueGroup}\\r?\\n[ ]{2}queue: max$`, 'm'),
      `${file} must join the shared queue`,
    );
    assert.doesNotMatch(source, /^[ ]{2}cancel-in-progress: true$/m, `${file} must not cancel a running invocation`);
  }
});

test('changelog audit keeps runner context references at step scope', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/opencode-changelog-audit.yml', import.meta.url), 'utf8');
  const jobEnv = workflow.match(/^[ ]{4}env:\r?\n([\s\S]*?)^[ ]{4}steps:/m)?.[1] ?? '';
  assert.doesNotMatch(jobEnv, /runner\.temp/, 'runner context is unavailable in job-level env');
});

test('first-look reviews publish as github-actions[bot] with only pull request write access', () => {
  const source = readFileSync(new URL('../../.github/workflows/opencode-first-look.yml', import.meta.url), 'utf8');
  const workflow = parse(source);
  const review = workflow.jobs.review;
  const publisher = review.steps.find((step) => step.name === 'Publish first-look result');

  assert.deepEqual(review.permissions, {
    contents: 'read',
    issues: 'read',
    'pull-requests': 'write',
    checks: 'read',
  });
  assert.equal(publisher.with['github-token'], '${{ github.token }}');
  assert.doesNotMatch(publisher.with['github-token'], /GH_PAT/);
  assert.match(publisher.with.script, /github\.rest\.pulls\.createReview/);
});
