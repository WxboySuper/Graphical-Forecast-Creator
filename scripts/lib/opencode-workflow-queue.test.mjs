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

test('every OpenCode workflow shares the single bounded concurrency queue', () => {
  for (const file of workflowFiles.filter((file) => !file.endsWith('opencode-first-look.yml'))) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(
      source,
      new RegExp(`^concurrency:\\r?\\n[ ]{2}group: ${queueGroup}\\r?\\n[ ]{2}queue: max$`, 'm'),
      `${file} must join the shared queue`,
    );
    assert.doesNotMatch(source, /^[ ]{2}cancel-in-progress: true$/m, `${file} must not cancel a running invocation`);
  }

  const firstLook = parse(readFileSync(new URL('../../.github/workflows/opencode-first-look.yml', import.meta.url), 'utf8'));
  assert.equal(firstLook.concurrency, undefined, 'CI waiting must stay outside the OpenCode queue');
  assert.equal(firstLook.jobs['wait-for-ci'].concurrency, undefined);
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
  assert.equal(publisher.with['github-token'], '${{ github.token }}');
  assert.doesNotMatch(publisher.with['github-token'], /GH_PAT/);
  assert.match(publisher.with.script, /github\.rest\.issues\.createComment/);
  assert.match(publisher.with.script, /github\.rest\.issues\.updateComment/);
  assert.doesNotMatch(publisher.with.script, /github\.rest\.pulls\.createReview/);
});

test('audit issue worker uses GH_PAT to push branches and open implementation PRs', () => {
  const workflow = parse(readFileSync(new URL('../../.github/workflows/opencode-audit-issue-worker.yml', import.meta.url), 'utf8'));
  const publish = workflow.jobs.implement.steps.find((step) => step.name === 'Push the branch, open a PR, and request first-look review');
  const model = workflow.jobs.implement.steps.find((step) => step.name === 'Run bounded audit implementation');

  assert.ok(publish);
  assert.ok(model);
  assert.match(publish.env.GH_TOKEN, /^\$\{\{\s*secrets\.GH_PAT\s*\}\}$/);
  assert.ok(!('GH_TOKEN' in (model.env ?? {})));
  assert.ok(!('GH_PAT' in (model.env ?? {})));
  assert.match(publish.run, /publish-opencode-audit-pr\.mjs/);
});
