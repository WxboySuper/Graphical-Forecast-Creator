/**
 * Stable-line pull-request check. It is deliberately loose: a PR into a stable branch (a backport or a
 * hotfix) does not need to bump the version, update the release manifest or touch the changelog, because
 * the release workflow does that. It only fails when the PR would leave package.json or
 * deploy/production-release.json in a state that breaks a production release.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { evaluateStableHotfixPolicy } from './lib/stable-hotfix-policy.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';

if (!/^stable\/\d+(?:\.\d+)?\.x$/.test(baseRef)) {
  console.log('Not a stable-line PR; skipping the stable-line policy.');
  process.exit(0);
}

const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const basePackage = JSON.parse(execFileSync('git', ['show', `origin/${baseRef}:package.json`], { encoding: 'utf8' }));
const manifestReleaseId = JSON.parse(readFileSync('deploy/production-release.json', 'utf8')).releaseId;

const { ok, problems } = evaluateStableHotfixPolicy({
  baseRef,
  basePackageVersion: basePackage.version,
  packageVersion,
  manifestReleaseId,
});

if (!ok) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log(`Stable-line policy OK: ${headRef || 'head'} -> ${baseRef} (package ${packageVersion}).`);
