import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { changelogLaneHeadingForBase, CHANGELOG_LANE_HEADINGS } from './lib/changelog-policy.mjs';
import { addOpenCodeChangelogEntries } from './lib/opencode-changelog.mjs';
import {
  assertChangelogAuditHead,
  parseOpenCodeChangelogAuditResult,
  validateChangelogAuditTarget,
} from './lib/opencode-changelog-audit.mjs';

const required = ['GITHUB_REPOSITORY', 'CONTEXT_PATH', 'OUTPUT_PATH', 'RESULT_PATH', 'GH_TOKEN'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required.`);
const context = JSON.parse(readFileSync(process.env.CONTEXT_PATH, 'utf8'));
const { targetRef, headSha: expectedHead } = validateChangelogAuditTarget(context.targetRef, context.headSha);

const result = parseOpenCodeChangelogAuditResult(readFileSync(process.env.OUTPUT_PATH, 'utf8'));
if (result.status === 'inconclusive') {
  writeFileSync(process.env.RESULT_PATH, JSON.stringify({ status: 'inconclusive' }), 'utf8');
  process.exit(0);
}
if (result.status === 'current') {
  writeFileSync(process.env.RESULT_PATH, JSON.stringify({ status: 'clean' }), 'utf8');
  process.exit(0);
}

const githubEnv = { ...process.env, GH_TOKEN: process.env.GH_TOKEN };
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', env: githubEnv }).trim();
execFileSync('git', ['fetch', '--no-tags', 'origin', `refs/heads/${targetRef}:refs/remotes/origin/${targetRef}`], { stdio: 'inherit' });
const liveHead = execFileSync('git', ['rev-parse', `refs/remotes/origin/${targetRef}`], { encoding: 'utf8' }).trim();
assertChangelogAuditHead(expectedHead, liveHead);

const impact = targetRef === 'main' ? 'beta' : 'hotfix';
const laneHeading = targetRef === 'main' ? CHANGELOG_LANE_HEADINGS['next-major'] : changelogLaneHeadingForBase(targetRef);
const updated = addOpenCodeChangelogEntries({
  changelog: readFileSync('CHANGELOG.md', 'utf8'),
  laneHeading,
  section: result.section,
  entries: result.entries,
});
const targetSlug = targetRef.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
const branch = `opencode/changelog-audit-${targetSlug}-${expectedHead.slice(0, 10)}`;
const existing = JSON.parse(gh(['pr', 'list', '--state', 'all', '--base', targetRef, '--head', branch, '--json', 'number,state,url']));
if (existing.length) {
  const pull = existing[0];
  writeFileSync(process.env.RESULT_PATH, JSON.stringify({
    status: pull.state === 'OPEN' ? 'pr-opened' : 'clean',
    number: pull.number,
    url: pull.url,
    branch,
    suppressed: pull.state !== 'OPEN',
  }), 'utf8');
  process.exit(0);
}

const remoteBranch = execFileSync('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' }).trim();
if (remoteBranch) throw new Error(`Changelog audit branch ${branch} already exists without a matching pull request; refusing to overwrite it.`);
execFileSync('git', ['checkout', '--detach', `refs/remotes/origin/${targetRef}`], { stdio: 'inherit' });
writeFileSync('CHANGELOG.md', updated, 'utf8');
execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
execFileSync('git', ['add', '--', 'CHANGELOG.md']);
const changed = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
if (changed.length !== 1 || changed[0] !== 'CHANGELOG.md') throw new Error('Publisher may change only CHANGELOG.md.');
execFileSync('git', ['diff', '--cached', '--check'], { stdio: 'inherit' });
const digest = createHash('sha256').update(`${targetRef}|${expectedHead}|${updated}`).digest('hex').slice(0, 12);
execFileSync('git', ['commit', '-m', `docs: reconcile changelog ${digest}`], { stdio: 'inherit' });
const auth = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64')}`;
execFileSync('git', ['-c', `http.https://github.com/.extraheader=${auth}`, 'push', 'origin', `HEAD:refs/heads/${branch}`], { stdio: 'inherit' });

const bullets = result.entries.join('\n');
const body = [
  'This PR was prepared by the bounded OpenCode changelog audit after comparing repository changes with the current Unreleased entry.',
  '',
  `Changelog-Impact: ${impact}`,
  '',
  `Target release line: \`${targetRef}\``,
  `Audited revision: \`${expectedHead}\``,
  '',
  'Proposed user-facing entries:',
  bullets,
  '',
  'Review the wording and lane before merging. This workflow never merges PRs.',
].join('\n');
const url = gh(['pr', 'create', '--base', targetRef, '--head', branch, '--title', 'docs: reconcile changelog with repository changes', '--body', body]);
const pullNumber = Number(url.match(/\/pull\/(\d+)$/)?.[1]);
if (!Number.isInteger(pullNumber)) throw new Error('GitHub did not return a pull request URL after publication.');
writeFileSync(process.env.RESULT_PATH, JSON.stringify({ status: 'pr-opened', number: pullNumber, url, branch }), 'utf8');
