import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readWorkflow = (name) => parse(readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8'));
const checkoutSteps = (workflow) => Object.values(workflow.jobs).flatMap((job) => job.steps ?? []).filter((step) => step.uses?.startsWith('actions/checkout@'));
const allSteps = (job) => job.steps ?? [];

const localImportPattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const visitLocalImports = (file, visited = new Set()) => {
  const absolute = path.resolve(file);
  if (visited.has(absolute)) return visited;
  visited.add(absolute);
  const source = readFileSync(absolute, 'utf8');
  assert.doesNotMatch(source, /createRequire\s*\(|import\s*\(\s*process\.cwd/, `${path.relative(repositoryRoot, absolute)} must not resolve executable dependencies from the PR working directory`);
  for (const match of source.matchAll(localImportPattern)) {
    const dependency = path.resolve(path.dirname(absolute), match[1]);
    assert.ok(dependency.startsWith(path.join(repositoryRoot, 'scripts') + path.sep), `${path.relative(repositoryRoot, absolute)} imports outside trusted scripts: ${match[1]}`);
    visitLocalImports(dependency, visited);
  }
  return visited;
};

test('trusted PR changelog automation runs only in pull_request_target with read-only job permissions', () => {
  const workflow = readWorkflow('opencode-changelog-pr.yml');
  assert.deepEqual(workflow.on.pull_request_target.types, ['opened', 'synchronize', 'reopened', 'ready_for_review', 'edited']);
  assert.equal(workflow.concurrency.group, 'gfc-opencode-maintenance-queue');
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions['pull-requests'], 'read');
  assert.deepEqual(Object.keys(workflow.permissions).sort(), ['contents', 'pull-requests']);
  for (const [name, job] of Object.entries(workflow.jobs)) {
    assert.equal(job.permissions, undefined, `${name} must not elevate GITHUB_TOKEN permissions`);
  }
});

test('default-branch tools are isolated before PR checkout and credential-bearing execution', () => {
  const workflow = readWorkflow('opencode-changelog-pr.yml');
  const jobs = [workflow.jobs['prepare-automated-changelog'], workflow.jobs['generate-changelog']];
  for (const job of jobs) {
    const trusted = allSteps(job).find((step) => step.name === 'Check out trusted default-branch tooling');
    assert.equal(trusted.with.ref, '${{ github.event.repository.default_branch }}');
    assert.equal(trusted.with.path, '_trusted');
    assert.equal(trusted.with['persist-credentials'], false);
  }

  const changelog = workflow.jobs['generate-changelog'];
  const steps = allSteps(changelog);
  const trustedCheckoutIndex = steps.findIndex((step) => step.name === 'Check out trusted default-branch tooling');
  const contextIndex = steps.findIndex((step) => step.name === 'Prepare bounded changelog context');
  const prCheckoutIndex = steps.findIndex((step) => step.name === 'Check out exact PR content without persisted credentials');
  const prepareIndex = steps.findIndex((step) => step.name === 'Remove sensitive files and project OpenCode configuration');
  const modelIndex = steps.findIndex((step) => step.name === 'Run read-only OpenCode changelog generation');
  const publishIndex = steps.findIndex((step) => step.name === 'Validate and publish changelog with trusted tooling');
  assert.ok(trustedCheckoutIndex < contextIndex && contextIndex < prCheckoutIndex && prCheckoutIndex < prepareIndex && prepareIndex < modelIndex && modelIndex < publishIndex);

  const prCheckout = steps[prCheckoutIndex];
  assert.equal(prCheckout.with.path, '_pr');
  assert.equal(prCheckout.with['persist-credentials'], false);
  assert.equal(prCheckout.with.ref, '${{ steps.changelog-context.outputs.head_sha }}');
  assert.equal(steps[prepareIndex]['working-directory'], '_pr');
  assert.match(steps[prepareIndex].run, /_trusted\/scripts\/prepare-opencode-workspace\.mjs/);
  assert.equal(steps[modelIndex]['working-directory'], '_pr');
  assert.match(steps[modelIndex].run, /_trusted\/scripts\/run-opencode-maintenance\.mjs/);
  assert.equal(steps[publishIndex]['working-directory'], '_pr');
  assert.match(steps[publishIndex].run, /_trusted\/scripts\/publish-opencode-changelog\.mjs/);
});

test('API and publishing credentials never share a step with PR-controlled execution', () => {
  const workflow = readWorkflow('opencode-changelog-pr.yml');
  const all = Object.entries(workflow.jobs).flatMap(([jobName, job]) => allSteps(job).map((step) => ({ jobName, step })));
  const apiKey = all.find(({ step }) => step.env?.OPENCODE_API_KEY);
  const publisher = all.find(({ step }) => step.name === 'Validate and publish changelog with trusted tooling');
  const automatedPreparation = all.find(({ step }) => step.name === 'Prepare automated changelog metadata with trusted tooling');
  assert.ok(apiKey);
  assert.ok(publisher);
  assert.ok(automatedPreparation);
  assert.equal(apiKey.step.name, 'Run read-only OpenCode changelog generation');
  assert.match(apiKey.step.run, /_trusted\/scripts\/run-opencode-maintenance\.mjs/);
  assert.equal(apiKey.step.env.GH_TOKEN, undefined);
  assert.equal(apiKey.step.env.GH_PAT, undefined);
  const modelPermissions = JSON.parse(apiKey.step.env.OPENCODE_PERMISSION);
  assert.equal(modelPermissions['*'], 'deny');
  assert.notEqual(modelPermissions.bash, 'allow');
  assert.equal(publisher.step.env.GH_TOKEN, '${{ secrets.GH_PAT }}');
  assert.equal(automatedPreparation.step.env.GH_TOKEN, '${{ secrets.GH_PAT }}');
  assert.match(automatedPreparation.step.run, /_trusted\/scripts\/prepare-changelog-governance\.mjs/);
  assert.match(publisher.step.run, /_trusted\/scripts\/publish-opencode-changelog\.mjs/);
  assert.equal(publisher.step.env.OPENCODE_API_KEY, undefined);
  assert.equal(publisher.step.env.GITHUB_TOKEN, undefined);
  for (const { step } of all) {
    if (!step.uses?.startsWith('actions/checkout@')) continue;
    assert.equal(step.with['persist-credentials'], false, `${step.name} must not leave checkout credentials in the repository`);
  }
});

test('credential-bearing scripts and every local import resolve inside the trusted scripts tree', () => {
  for (const script of [
    'prepare-changelog-governance.mjs',
    'validate-port-pr-policy.mjs',
    'prepare-opencode-workspace.mjs',
    'run-opencode-maintenance.mjs',
    'publish-opencode-changelog.mjs',
  ]) {
    const files = visitLocalImports(path.join(repositoryRoot, 'scripts', script));
    assert.ok(files.size >= 1);
  }
});

test('ordinary pull_request CI has no repository secrets, write permissions, or persisted checkout credentials', () => {
  const workflow = readWorkflow('ci.yml');
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions['pull-requests'], 'read');
  assert.equal(workflow.jobs['pr-governance'].permissions.contents, 'read');
  assert.equal(workflow.jobs['pr-governance'].permissions['pull-requests'], 'read');
  const ciSource = readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  assert.doesNotMatch(ciSource, /secrets\.(?:GH_PAT|OPENCODE_API_KEY)/);
  assert.doesNotMatch(ciSource, /GH_TOKEN:\s*\$\{\{\s*github\.token/);
  for (const step of checkoutSteps(workflow)) {
    assert.equal(step.with?.['persist-credentials'], false, 'CI must not leave a PR-readable credential in .git/config');
    assert.equal(step.with?.token, undefined, 'CI checkout must use the default read-only workflow token');
  }
});


test('trusted publisher authenticates private-repository fetches without persisting the header', () => {
  const publisher = readFileSync(path.join(repositoryRoot, 'scripts/publish-opencode-changelog.mjs'), 'utf8');
  assert.match(publisher, /const gitAuth = .*Buffer\.from\(\x60x-access-token:\$\{token\}\x60\)/);
  assert.match(publisher, /execFileSync\('git', \[\x27-c\x27, gitAuth, \x27fetch\x27/);
  assert.doesNotMatch(publisher, /git config --local .*extraheader/);
});

test('workspace preparation removes project OpenCode configuration even without sparse-checkout exclusions', () => {
  const source = readFileSync(path.join(repositoryRoot, 'scripts/prepare-opencode-workspace.mjs'), 'utf8');
  assert.ok(source.indexOf('removeProjectOpenCodeConfiguration(process.cwd())') < source.indexOf('if (!excludedPaths.length && !scope)'));
});

test('manual changelog audits pass an optional bounded baseline through the trusted workflow', () => {
  const workflow = readWorkflow('opencode-changelog-audit.yml');
  assert.equal(workflow.on.workflow_dispatch.inputs.baseline_ref.required, false);
  assert.equal(workflow.on.workflow_dispatch.inputs.baseline_ref.type, 'string');
  assert.equal(workflow.jobs.audit.env.BASELINE_REF, "${{ inputs.baseline_ref || github.event.inputs.baseline_ref || '' }}");
  const context = allSteps(workflow.jobs.audit).find((step) => step.name === 'Prepare bounded changelog audit context and state');
  assert.equal(context.env.BASELINE_REF, '${{ env.BASELINE_REF }}');
  assert.match(context.with.script, /resolveManualChangelogAuditBaseline/);
  assert.match(context.with.script, /baselineSha = manualBaselineSha/);
  assert.match(context.with.script, /&& !manualBaselineSha/);
});
