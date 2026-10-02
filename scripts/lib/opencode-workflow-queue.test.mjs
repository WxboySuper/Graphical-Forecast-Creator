import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { parse } = createRequire(import.meta.url)('yaml');

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
const ghActionsExpr = (expression) => ['$', '{{ ', expression, ' }}'].join('');

test('every OpenCode workflow shares the single bounded concurrency queue', () => {
  for (const workflowFile of workflowFiles.filter((candidate) => !candidate.endsWith('opencode-first-look.yml'))) {
    const source = readFileSync(new URL(workflowFile, import.meta.url), 'utf8');
    assert.match(
      source,
      new RegExp(`^concurrency:\\r?\\n[ ]{2}group: ${queueGroup}\\r?\\n[ ]{2}queue: max$`, 'm'),
      `${workflowFile} must join the shared queue`,
    );
    assert.doesNotMatch(source, /^[ ]{2}cancel-in-progress: true$/m, `${workflowFile} must not cancel a running invocation`);
  }

  const firstLook = parse(readFileSync(new URL('../../.github/workflows/opencode-first-look.yml', import.meta.url), 'utf8'));
  assert.ok(firstLook.concurrency === undefined, 'CI waiting must stay outside the OpenCode queue');
  assert.ok(firstLook.jobs['wait-for-ci'].concurrency === undefined);
  assert.deepEqual(firstLook.jobs.review.concurrency, { group: queueGroup, queue: 'max' });
});

test('changelog audit keeps runner context references at step scope', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/opencode-changelog-audit.yml', import.meta.url), 'utf8');
  const jobEnv = workflow.match(/^[ ]{4}env:\r?\n([\s\S]*?)^[ ]{4}steps:/m)?.[1] ?? '';
  assert.doesNotMatch(jobEnv, /runner\.temp/, 'runner context is unavailable in job-level env');
});

test('first-look reviews publish one bot comment with read-only issue and pull-request write access', () => {
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
  assert.deepEqual(workflow.jobs['wait-for-ci'].permissions, {
    'pull-requests': 'read',
    actions: 'read',
  });
  assert.equal(publisher.env.GH_TOKEN, ghActionsExpr('github.token'));
  assert.doesNotMatch(publisher.env.GH_TOKEN, /GH_PAT/);
  assert.match(publisher.run, /publish-opencode-first-look\.mjs/);
  assert.doesNotMatch(source, /pulls\.createReview/);
});
