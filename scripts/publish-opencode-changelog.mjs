import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { CHANGELOG_LANE_HEADINGS, parseChangelogDeclaration, changelogLaneHeadingForBase } from './lib/changelog-policy.mjs';
import { addOpenCodeChangelogEntries, parseOpenCodeChangelogResult } from './lib/opencode-changelog.mjs';
import { githubHttpExtraHeader } from './lib/opencode-git-auth.mjs';

const required = ['GITHUB_REPOSITORY', 'PR_NUMBER', 'BASE_REF', 'HEAD_REF', 'EXPECTED_HEAD_SHA', 'EXPECTED_BODY_SHA', 'EXPECTED_TITLE_SHA', 'OPENCODE_OUTPUT_PATH', 'GH_TOKEN'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required.`);
const { GITHUB_REPOSITORY: repository, PR_NUMBER: numberText, BASE_REF: baseRef, HEAD_REF: headRef, EXPECTED_HEAD_SHA: expectedSha, OPENCODE_OUTPUT_PATH: outputPath, GH_TOKEN: token } = process.env;
const prNumber = Number(numberText);
if (!Number.isInteger(prNumber) || prNumber < 1 || !/^[a-f0-9]{40}$/i.test(expectedSha)) throw new Error('PR number or expected head SHA is invalid.');
if (!/^[A-Za-z0-9._/-]+$/.test(headRef) || headRef.includes('..') || headRef.includes('//') || headRef.startsWith('/') || headRef.endsWith('/') || headRef.endsWith('.lock')) throw new Error('PR head branch name is invalid.');
if (headRef === 'main' || headRef === 'beta' || /^stable\/\d+\.\d+\.x$/.test(headRef)) throw new Error('Refusing to write a protected source branch.');
if (!/^(main|stable\/\d+\.\d+\.x)$/.test(baseRef)) throw new Error('Changelog generation only supports main and stable release branches.');

const apiEnv = { ...process.env, GH_TOKEN: token };
const pull = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/pulls/${prNumber}`], { encoding: 'utf8', env: apiEnv }));
const hash = (value) => createHash('sha256').update(value ?? '').digest('hex');
if (pull.head?.sha !== expectedSha || pull.head?.ref !== headRef || pull.base?.ref !== baseRef || pull.head?.repo?.full_name?.toLowerCase() !== repository.toLowerCase() || hash(pull.body) !== process.env.EXPECTED_BODY_SHA || hash(pull.title) !== process.env.EXPECTED_TITLE_SHA) {
  throw new Error('PR identity or head revision changed during changelog generation; retry against the latest revision.');
}
if (!['OWNER', 'MEMBER', 'COLLABORATOR'].includes(pull.author_association)) throw new Error('PR author is not eligible for autonomous changelog generation.');
const declaration = parseChangelogDeclaration(pull.body ?? '');
if (!declaration.ok || !['beta', 'hotfix'].includes(declaration.impact)) throw new Error('The live PR description must declare exactly one beta or hotfix changelog impact.');

const result = parseOpenCodeChangelogResult(readFileSync(outputPath, 'utf8'));
if (result.status !== 'complete') throw new Error('OpenCode could not produce a sufficiently grounded changelog entry; add it manually and rerun CI.');

const fetchRef = (ref) => {
  if (!/^(main|stable\/\d+\.\d+\.x)$/.test(ref) && ref !== headRef) throw new Error('Invalid Git ref.');
  return `refs/heads/${ref}:refs/remotes/origin/${ref}`;
};
const gitAuth = githubHttpExtraHeader(token);
execFileSync('git', ['-c', gitAuth, 'fetch', '--no-tags', 'origin', fetchRef(baseRef), fetchRef(headRef)], { stdio: 'inherit' });
const actualSha = execFileSync('git', ['rev-parse', `origin/${headRef}`], { encoding: 'utf8' }).trim();
if (actualSha !== expectedSha) throw new Error('PR branch advanced while the changelog was being generated; refusing to publish stale content.');
const changed = execFileSync('git', ['diff', '--name-only', `origin/${baseRef}...origin/${headRef}`], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
if (changed.includes('CHANGELOG.md')) throw new Error('PR changelog changed during generation; refusing to overwrite it.');
execFileSync('git', ['checkout', '--detach', `origin/${headRef}`], { stdio: 'inherit' });

const laneHeading = declaration.impact === 'hotfix'
  ? (baseRef.startsWith('stable/') ? changelogLaneHeadingForBase(baseRef) : CHANGELOG_LANE_HEADINGS['stable-hotfix'])
  : CHANGELOG_LANE_HEADINGS['next-major'];
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const updated = addOpenCodeChangelogEntries({ changelog, laneHeading, section: result.section, entries: result.entries });
writeFileSync('CHANGELOG.md', updated, 'utf8');
execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
execFileSync('git', ['add', '--', 'CHANGELOG.md']);
execFileSync('git', ['diff', '--cached', '--check'], { stdio: 'inherit' });
execFileSync('git', ['commit', '-m', `docs: generate changelog entry for PR #${prNumber}`], { stdio: 'inherit' });
execFileSync('git', ['-c', githubHttpExtraHeader(token), 'push', 'origin', `HEAD:refs/heads/${headRef}`], { stdio: 'inherit' });
process.stdout.write(`Generated a ${result.section.toLowerCase()} changelog entry for PR #${prNumber}.\n`);
