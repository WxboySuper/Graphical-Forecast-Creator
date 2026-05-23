import { execFileSync } from 'node:child_process';
import { changelogTouchesPr } from './lib/changelog.mjs';
import {
  dependabotChangelogTouchesPr,
  listDependencyBumpsBetweenRefs,
} from './lib/dependabot-changelog.mjs';
import { evaluateBranchPolicy } from './lib/branch-policy.mjs';
import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const prBody = process.env.PR_BODY ?? '';

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping changelog check.');
  process.exit(0);
}

const branchPolicy = evaluateBranchPolicy({ baseRef, headRef });
if (!branchPolicy.ok) {
  process.exit(0);
}

if (branchPolicy.kind === 'beta-promotion') {
  console.log('Skipping changelog file check for beta → main promotion PR (verify release notes before merge).');
  process.exit(0);
}

if (branchPolicy.kind === 'release-infrastructure') {
  console.log('Skipping changelog check for release infrastructure PR (workflow/CI only).');
  process.exit(0);
}

if (headRef.startsWith('port/')) {
  console.log('Skipping changelog check for automated port PR.');
  process.exit(0);
}

const changedFiles = listChangedFilesBetweenRefs(baseRef, headRef);

if (headRef.startsWith('dependabot/')) {
  const bumps = listDependencyBumpsBetweenRefs(baseRef, headRef);
  const changelogAtHead = execFileSync('git', ['show', `origin/${headRef}:CHANGELOG.md`], {
    encoding: 'utf8',
  });
  const result = dependabotChangelogTouchesPr(changedFiles, changelogAtHead, bumps);
  if (!result.ok) {
    console.error(result.reason);
    process.exit(1);
  }
  console.log(result.reason);
  process.exit(0);
}

const result = changelogTouchesPr(changedFiles, prBody);

if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}

console.log(result.reason);
