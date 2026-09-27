import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { parse } = createRequire(import.meta.url)('yaml');

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = parse(readFileSync(path.join(repositoryRoot, '.github/workflows/opencode-first-look.yml'), 'utf8'));
const steps = workflow.jobs.review.steps;

test('first-look review keeps its least-privilege read context and one bot-owned summary comment', () => {
  assert.deepEqual(workflow.on.pull_request_target.types, ['opened', 'synchronize', 'reopened', 'ready_for_review']);
  assert.equal(workflow.jobs.review.permissions.contents, 'read');
  assert.equal(workflow.jobs.review.permissions['pull-requests'], 'read');
  assert.equal(workflow.jobs.review.permissions.issues, 'write');
  assert.equal(workflow.jobs.review.permissions.checks, 'read');
  assert.equal(workflow.jobs.review.permissions.actions, undefined);
  const context = steps.find((step) => step.name === 'Prepare bounded PR context');
  assert.match(context.with.script, /closingIssuesReferences/);
  assert.match(context.with.script, /reviewThreads\(first: 50\)/);
  assert.match(context.with.script, /gfc-opencode-first-look-summary/);
  assert.match(context.with.script, /compare\/\{basehead\}/);

  const publish = steps.find((step) => step.name === 'Publish first-look result');
  assert.equal(publish.env.CONTEXT_PATH, '${{ runner.temp }}/opencode-pr-review-context.json');
  assert.match(publish.with.script, /parseOpenCodeFirstLookOutput/);
  assert.match(publish.with.script, /issues\.updateComment/);
  assert.match(publish.with.script, /issues\.createComment/);
  assert.doesNotMatch(publish.with.script, /pulls\.createReview/);

  const AsyncFunction = Object.getPrototypeOf(async function noop() {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction('github', 'context', 'core', 'require', context.with.script), 'context script should parse');
  assert.doesNotThrow(() => new AsyncFunction('github', 'context', 'core', 'require', publish.with.script), 'publisher script should parse');
});
