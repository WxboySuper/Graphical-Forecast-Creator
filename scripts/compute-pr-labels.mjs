import { execFileSync } from 'node:child_process';
import { evaluateBranchPolicy } from './lib/branch-policy.mjs';
import { changelogTouchesPr } from './lib/changelog.mjs';
import {
  dependabotChangelogTouchesPr,
  listDependencyBumpsBetweenRefs,
} from './lib/dependabot-changelog.mjs';
import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';
import { CONTENT_MANAGED_LABELS, computePrLabels } from './lib/pr-labels.mjs';
import { BETA_CHANGELOG_PATH, betaChangelogTouchesPr } from './lib/beta-changelog.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const prBody = process.env.PR_BODY ?? '';
const prNumber = Number(process.env.PR_NUMBER ?? 0);

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping label computation.');
  process.exit(0);
}

const changedFiles = listChangedFilesBetweenRefs(baseRef, headRef);

const branchPolicy = evaluateBranchPolicy({ baseRef, headRef });
let changelogOk = true;

if (
  branchPolicy.ok &&
  branchPolicy.kind !== 'beta-promotion' &&
  branchPolicy.kind !== 'release-infrastructure' &&
  !headRef.startsWith('port/')
) {
  if (headRef.startsWith('dependabot/')) {
    const bumps = listDependencyBumpsBetweenRefs(baseRef, headRef);
    const changelogPath = baseRef === 'beta' ? BETA_CHANGELOG_PATH : 'CHANGELOG.md';
    const changelogAtHead = execFileSync('git', ['show', `origin/${headRef}:${changelogPath}`], {
      encoding: 'utf8',
    });
    changelogOk = baseRef === 'beta'
      ? betaChangelogTouchesPr(changedFiles, changelogAtHead, prNumber).ok
      : dependabotChangelogTouchesPr(changedFiles, changelogAtHead, bumps).ok;
  } else if (baseRef === 'beta') {
    const changelogAtHead = execFileSync('git', ['show', `origin/${headRef}:${BETA_CHANGELOG_PATH}`], {
      encoding: 'utf8',
    });
    changelogOk = betaChangelogTouchesPr(changedFiles, changelogAtHead, prNumber).ok;
  } else {
    const changelogResult = changelogTouchesPr(changedFiles, prBody);
    changelogOk = changelogResult.ok;
  }
}

const labels = computePrLabels({
  head: headRef,
  base: baseRef,
  changedFiles,
  mergeable: null,
  draft: false,
  changelogOk,
});

console.log(JSON.stringify({ labels, contentManaged: CONTENT_MANAGED_LABELS }));
