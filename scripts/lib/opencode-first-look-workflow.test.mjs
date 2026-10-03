import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { parse } = createRequire(import.meta.url)('yaml');

/** Build a literal GitHub Actions expression string without `${{` template-literal syntax. */
const ghActionsExpr = (expression) => ['$', '{{ ', expression, ' }}'].join('');

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = parse(readFileSync(path.join(repositoryRoot, '.github/workflows/opencode-first-look.yml'), 'utf8'));
const waitJob = workflow.jobs['wait-for-ci'];
const waitStep = waitJob.steps.find((step) => step.name === 'Wait for matching Checks | CI');
const steps = workflow.jobs.review.steps;
const runner = steps.find((step) => step.name === 'Run read-only review');

test('first-look review keeps read-only repository access and one bot-owned summary comment', () => {
  assert.deepEqual(workflow.on.pull_request_target.types, ['opened', 'synchronize', 'reopened', 'ready_for_review']);
  assert.deepEqual(workflow.on.issue_comment.types, ['created']);
  assert.ok(workflow.on.workflow_run === undefined);
  assert.ok(workflow.concurrency === undefined, 'CI waiting must not hold the shared OpenCode queue');
  assert.ok(waitJob.concurrency === undefined, 'the CI waiter must run outside the model queue');
  assert.equal(workflow.jobs.review.needs, 'wait-for-ci');
  assert.deepEqual(workflow.jobs.review.concurrency, { group: 'gfc-opencode-maintenance-queue', queue: 'max' });
  assert.equal(waitJob.permissions['pull-requests'], 'read');
  assert.equal(waitJob.permissions.actions, 'read');
  assert.ok(workflow.jobs.review.permissions.actions === undefined);
  assert.equal(workflow.jobs.review.permissions.contents, 'read');
  assert.equal(workflow.jobs.review.permissions['pull-requests'], 'write');
  assert.equal(workflow.jobs.review.permissions.issues, 'read');
  assert.equal(workflow.jobs.review.permissions.checks, 'read');
  const context = steps.find((step) => step.name === 'Prepare bounded PR context');
  assert.equal(runner.env.OPENCODE_FILE_PATHS, `${ghActionsExpr('github.workspace')}/.opencode-pr-review/opencode-pr-review-context.json`);
  assert.equal(runner.env.OPENCODE_REPAIR_FIRST_LOOK, 'true', 'incomplete model output gets one bounded completion pass before publication');
  assert.match(context.with.script, /PR review context must be written inside the OpenCode workspace/);
  assert.match(context.with.script, /Read the attached opencode-pr-review-context\.json completely/);
  assert.ok(steps.some((step) => step.name === 'Verify PR review context is readable in the OpenCode workspace'));
  const promptBlock = context.with.script.match(/const prompt = \[([\s\S]*?)\n\s*\]\.filter/);
  assert.ok(promptBlock, 'review prompt should be a separate bounded string');
  assert.doesNotMatch(promptBlock[1], /JSON\.stringify\(contextData\)/);
  assert.match(context.with.script, /Give exactly 10 when there are no current or unresolved prior findings/);
  assert.match(context.with.script, /A 9 is the merge threshold and is only for P3 cosmetic or optional polish findings/);
  assert.match(context.with.script, /Any bug, security, performance, API, test\/verification, behavior, or reliability finding must be P0-P2 and score at most 8/);
  assert.match(context.with.script, /Every score below 10 needs findings that directly explain what keeps this PR from being perfect/);
  assert.match(context.with.script, /A GitHub thread being open is not proof that its code concern remains unresolved/);
  assert.match(context.with.script, /search surrounding code or history as needed until you can judge the technical status/);
  assert.match(context.with.script, /Missing or invalid thread assessments stop publication/);
  assert.match(context.with.script, /closingIssuesReferences/);
  assert.match(context.with.script, /reviewThreads\(first: 100, after: \$after\)/);
  assert.match(context.with.script, /while \(moreReviewThreads\)/);
  assert.match(context.with.script, /could not return the complete review-thread history/);
  assert.doesNotMatch(context.with.script, /filter\(\(thread\) => !thread\.isResolved\)\.slice/);
  assert.doesNotMatch(context.with.script, /comments\.nodes\.slice/);
  assert.match(context.with.script, /gfc-opencode-first-look-summary/);
  assert.match(context.with.script, /compare\/\{basehead\}/);
  assert.match(context.with.script, /changedLineNumbers/);
  assert.equal(context.env.PULL_NUMBER, ghActionsExpr('needs.wait-for-ci.outputs.pull_number'));
  assert.equal(context.env.REVIEW_SHA, ghActionsExpr('needs.wait-for-ci.outputs.head_sha'));
  assert.equal(context.env.CI_RUN_URL, ghActionsExpr('needs.wait-for-ci.outputs.ci_run_url'));
  assert.match(context.with.script, /priorFindingAssessments/);
  assert.match(context.with.script, /latestChanges/);
  assert.match(context.with.script, /review-opencode/);
  assert.match(context.with.script, /model context and OpenCode compaction are available/);
  assert.match(context.with.script, /revisionTruncationReasons/);
  assert.match(context.with.script, /diffTruncationReasons/);
  assert.doesNotMatch(context.with.script, /file\.patch\?\.slice/);
  assert.doesNotMatch(context.with.script, /comparison\.commits \?\? \[\]\)\.slice/);
  assert.match(context.with.script, /GitHub could not return the complete review-thread history/);
  assert.doesNotMatch(context.with.script, /Deferring first-look/);

  assert.match(waitStep.with.script, /waitForMatchingCiRun/);
  assert.match(waitStep.with.script, /CI_TIMEOUT_MS/);
  assert.match(waitStep.with.script, /Skipping this stale review/);
  assert.match(waitStep.with.script, /pull\.head\.ref/);
  assert.match(waitStep.with.script, /The review will now enter the shared OpenCode queue/);
  assert.match(waitJob.outputs.run, /steps\.wait\.outputs\.run/);

  const publish = steps.find((step) => step.name === 'Publish first-look result');
  assert.equal(publish.env.CONTEXT_PATH, `${ghActionsExpr('github.workspace')}/.opencode-pr-review/opencode-pr-review-context.json`);
  assert.equal(publish.env.PULL_NUMBER, ghActionsExpr('needs.wait-for-ci.outputs.pull_number'));
  assert.equal(publish.env.REVIEW_SHA, ghActionsExpr('needs.wait-for-ci.outputs.head_sha'));
  assert.match(publish.run, /publish-opencode-first-look\.mjs/);
  assert.equal(
    publish.if,
    ghActionsExpr("!cancelled() && steps.context.outputs.run == 'true'"),
    'publish must run after a failed review step so unavailable comments replace stale scores',
  );
  assert.match(context.with.script, /openedAtCommitOid/);
  assert.match(context.with.script, /"contextRead":true/);
  assert.match(context.with.script, /filesReviewed/);

  // skipcq: JS-0057, JS-0241 -- AsyncFunction is required to syntax-check embedded github-script bodies.
  const AsyncFunction = Object.getPrototypeOf(async function asyncSyntaxProbe() { await Promise.resolve(); }).constructor;
  assert.doesNotThrow(() => new AsyncFunction('github', 'context', 'core', 'require', waitStep.with.script), 'CI wait script should parse');
  assert.doesNotThrow(() => new AsyncFunction('github', 'context', 'core', 'require', context.with.script), 'context script should parse');
});
