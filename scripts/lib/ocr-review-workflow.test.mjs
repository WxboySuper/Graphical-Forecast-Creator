import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { parse } = createRequire(import.meta.url)('yaml');

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(repositoryRoot, '.github/workflows/ocr-review.yml'), 'utf8');
const workflow = parse(source);
const job = workflow.jobs['ocr-review'];
const steps = job.steps;
const stepById = (id) => steps.find((step) => step.id === id);

test('OCR review runs on every pull request head SHA', () => {
  assert.deepEqual(workflow.on.pull_request_target.types, ['opened', 'ready_for_review', 'synchronize', 'reopened', 'edited']);
  assert.deepEqual(workflow.on.issue_comment.types, ['created']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false, 'a newer head must not cancel the run that still owes a result');
  assert.match(workflow.concurrency.group, /gfc-ocr-/);
});

test('the automatic and the manual review do not share a concurrency group', () => {
  // GitHub drops a queued run when a newer run enters the same group. A
  // manual /ocr review queued behind an automatic run would vanish the next
  // time somebody pushed, so the two paths get separate per-PR groups.
  const group = workflow.concurrency.group;
  assert.match(group, /gfc-ocr-pr-/);
  assert.match(group, /gfc-ocr-manual-/);
});

test('the job itself never filters a pull request event', () => {
  // A job-level `if` that skips a PR event leaves the required check pending
  // on that head SHA, which is exactly what blocks the merge. Draft, HOLD/WIP,
  // and fork PRs are handled by a step-level skip instead.
  const pullRequestBranch = job.if.split('||')[0];
  assert.match(pullRequestBranch, /github\.event_name == 'pull_request_target'/);
  assert.doesNotMatch(pullRequestBranch, /&&/, 'the pull request branch of the job `if` must stay unconditional');
  assert.doesNotMatch(job.if, /draft/);
  assert.doesNotMatch(job.if, /HOLD/);
  assert.doesNotMatch(job.if, /WIP/);
  assert.doesNotMatch(source, /actions\/checkout/, 'pull_request_target must never check out pull request head code');
});

test('the pull request title never reaches a shell', () => {
  // pull_request_target runs with a write-scoped token and the API key
  // secret, so a title that lands in a run: block is a shell injection. The
  // title may only be read through env: or an expression.
  for (const step of steps.filter((candidate) => typeof candidate.run === 'string')) {
    assert.doesNotMatch(
      step.run,
      /github\.event\.pull_request\.title/,
      `the title must not be interpolated into "${step.name}"`,
    );
  }
});

test('a draft, HOLD/WIP, or fork pull request skips the review and still passes the gate', () => {
  const skip = stepById('skip');
  assert.ok(skip, 'the job needs a step-level skip decision');
  assert.match(skip.env.PR_DRAFT, /github\.event\.pull_request\.draft/);
  assert.match(skip.run, /skip=\$skip/);

  const ocr = stepById('ocr');
  assert.equal(ocr.if, "steps.skip.outputs.skip != 'true'");

  const digest = stepById('ocr-digest');
  assert.match(digest.if, /always\(\)/);
  assert.match(digest.if, /steps\.skip\.outputs\.skip != 'true'/);
  assert.match(digest.if, /steps\.ocr\.outcome != 'cancelled'/);
  assert.match(digest.if, /steps\.ocr\.outcome != 'skipped'/);

  const gate = stepById('ocr-gate');
  assert.equal(gate.if, 'always()');
  assert.match(gate.with.script, /OCR_SKIPPED === 'true'/);
  assert.match(gate.with.script, /core\.info\('OCR gate passed: this revision was skipped/);
  // A review that ran and failed still fails the gate.
  assert.match(gate.with.script, /outcome !== 'success'/);
  assert.match(gate.with.script, /core\.setFailed\(`OCR review did not complete/);
  assert.match(gate.with.script, /\\bcritical\\b\|\\bhigh\\b\|\\bmedium\\b/);
});

test('a fork head is not reviewed by the automatic run', () => {
  // The run holds a write-scoped token and the API key secret, and a
  // synchronize event lets a fork author re-arm it on every push. The
  // automatic review therefore stays inside this repository.
  const skip = stepById('skip');
  assert.match(skip.env.PR_HEAD_REPO, /github\.event\.pull_request\.head\.repo\.full_name/);
  assert.match(skip.env.REPOSITORY, /github\.repository/);
  assert.match(skip.run, /PR_HEAD_REPO.*!=.*REPOSITORY/);
});

test('a hold marker in the title skips the review whatever its case', () => {
  const skip = stepById('skip');
  // The old job-level condition used contains(), which ignores case. The
  // shell match that replaced it did not, so "wip: feature" started a full
  // review that the old workflow skipped. The hold check has to stay a
  // case-insensitive expression for that reason.
  const titleHolds = skip.env.PR_TITLE_HOLDS;
  assert.ok(titleHolds, 'the skip step needs the hold-marker decision');
  const markers = [...titleHolds.matchAll(/contains\(github\.event\.pull_request\.title, '([^']+)'\)/g)]
    .map((match) => match[1]);
  assert.deepEqual(markers, ['HOLD', 'WIP']);
  assert.match(skip.run, /PR_TITLE_HOLDS/);
  assert.doesNotMatch(skip.run, /\*HOLD\*/, 'a shell glob would match the case the old expression ignored');

  // GitHub compares strings without case, so the markers match in any case.
  const holds = (title) => markers.some((marker) => title.toLowerCase().includes(marker.toLowerCase()));
  for (const title of ['HOLD: work in progress', 'wip: feature', 'Hold: investigation', 'WIP', 'hold']) {
    assert.ok(holds(title), `"${title}" should skip the review`);
  }
  for (const title of ['Add a feature', 'Ship the fix', 'Refactor the map layer']) {
    assert.ok(!holds(title), `"${title}" should not skip the review`);
  }
});

test('a manual /ocr run reports a commit status on the pull request head', () => {
  assert.equal(workflow.permissions.statuses, 'write');

  const pending = steps.find((step) => step.name === 'Mark the manual review as pending on the PR head');
  assert.ok(pending, 'a comment run needs a pending status');
  assert.equal(pending.if, "github.event_name == 'issue_comment'");
  assert.match(pending.with.script, /state: 'pending'/);
  assert.match(pending.with.script, /context: 'ocr-review'/);

  const final = steps.find((step) => step.name === 'Report the ocr-review status on the PR head');
  assert.ok(final, 'a comment run needs a final status');
  assert.equal(final.if, "always() && github.event_name == 'issue_comment'");
  assert.equal(final.env.HEAD_SHA, '${{ steps.pr-refs.outputs.head_sha }}');
  assert.equal(final.env.GATE_OUTCOME, '${{ steps.ocr-gate.outcome }}');
  assert.match(final.env.RUN_URL, /actions\/runs\/\$\{\{ github\.run_id \}\}/);
  assert.match(final.with.script, /createCommitStatus/);
  assert.match(final.with.script, /context: 'ocr-review'/);
  assert.match(final.with.script, /GATE_OUTCOME === 'success' \? 'success' : 'failure'/);
  // A status API failure must never turn a finished review into a failed job.
  assert.match(final.with.script, /core\.warning\(`OCR status failed/);
});

test('the review model, budget, and merge gate stay unchanged', () => {
  const ocr = stepById('ocr');
  assert.equal(ocr.uses, 'alibaba/open-code-review@357c3f09a264563ab64d8f4fc3b25b186cd3c4a4');
  assert.equal(ocr.with.llm_model, "${{ vars.OCR_LLM_MODEL || 'minimax-m3.1-flash-free' }}");
  assert.equal(ocr.with.llm_url, "${{ vars.OCR_LLM_URL || 'https://opencode.ai/zen/go/v1/chat/completions' }}");
  assert.equal(ocr.with.effort, 'low');
  assert.equal(ocr.with.max_tokens_budget, '400000');
  assert.equal(ocr.with.incremental, 'true');
  assert.equal(ocr.with.llm_auth_token, '${{ secrets.OPENCODE_API_KEY }}');
});

test('the embedded github-script bodies parse', () => {
  // skipcq: JS-0057, JS-0241 -- AsyncFunction is required to syntax-check embedded github-script bodies.
  const AsyncFunction = Object.getPrototypeOf(async function asyncSyntaxProbe() { await Promise.resolve(); }).constructor;
  for (const step of steps.filter((candidate) => candidate.uses?.startsWith('actions/github-script@'))) {
    assert.doesNotThrow(
      () => new AsyncFunction('github', 'context', 'core', 'require', step.with.script),
      `the script in "${step.name}" should parse`,
    );
  }
});
