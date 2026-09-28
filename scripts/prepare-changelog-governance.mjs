import { execFileSync } from 'node:child_process';
import { dependabotChangelogDeclaration, listDependencyBumpsBetweenRefs } from './lib/dependabot-changelog.mjs';
import { parsePortBranch } from './lib/port-pr-policy.mjs';
import { upsertManagedChangelogDeclaration } from './lib/changelog-automation.mjs';
import { githubHttpExtraHeader } from './lib/opencode-git-auth.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';
const prNumber = Number(process.env.PR_NUMBER ?? 0);
const authorLogin = process.env.PR_AUTHOR_LOGIN ?? '';
const body = process.env.PR_BODY ?? '';
const isDependabot = authorLogin === 'dependabot[bot]' && headRef.startsWith('dependabot/');
const port = parsePortBranch(headRef);

if (!baseRef || !headRef || !repository || !prNumber) {
  console.error('GITHUB_BASE_REF, GITHUB_HEAD_REF, GITHUB_REPOSITORY, and PR_NUMBER are required.');
  process.exit(1);
}

if (!isDependabot && !port) {
  console.log('No automated changelog preparation required for this PR.');
  process.exit(0);
}

const token = process.env.GH_TOKEN ?? '';
if (!token) throw new Error('GH_TOKEN is required for trusted automated changelog preparation.');
if (headRef === 'main' || headRef === 'beta' || /^stable\/\d+\.\d+\.x$/.test(headRef)) {
  throw new Error('Refusing to write automated changelog metadata to a protected source branch.');
}
const gitAuth = githubHttpExtraHeader(token);
execFileSync('git', ['-c', gitAuth, 'fetch', '--no-tags', 'origin', `refs/heads/${baseRef}:refs/remotes/origin/${baseRef}`, `refs/heads/${headRef}:refs/remotes/origin/${headRef}`], { stdio: 'inherit' });

const stableLine = /^stable\/\d+\.\d+\.x$/.test(baseRef);
let declaration = null;
if (isDependabot) {
  const bumps = listDependencyBumpsBetweenRefs(baseRef, headRef);
  declaration = dependabotChangelogDeclaration(bumps, stableLine);
} else {
  declaration = {
    impact: 'inherited',
    sourcePr: port.sourcePrNumber,
  };
}

const nextBody = upsertManagedChangelogDeclaration(body, declaration);

if (nextBody !== body) {
  execFileSync(
    'gh',
    ['api', `repos/${repository}/pulls/${prNumber}`, '--method', 'PATCH', '--input', '-'],
    { input: JSON.stringify({ body: nextBody }), stdio: ['pipe', 'inherit', 'inherit'] },
  );
  console.log(`Updated PR #${prNumber} changelog declaration before validation.`);
}
