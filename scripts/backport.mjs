/**
 * Cherry-picks a merged main PR onto the stable lines it is labelled for and opens one PR per line.
 *
 * Runs in a checkout of main with full history, on trusted merge commits only; it never executes code
 * from a pull-request head. Env: REPOSITORY, SOURCE_PR, GH_TOKEN, and optional LINES (for example "2.x";
 * default is every backport-N.x label on the PR).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backportBody, backportBranch, backportTitle, linesFromLabels, stableBranchForLine } from './lib/backport.mjs';
import { pickWithoutChangelog } from './lib/backport-git.mjs';

const repository = process.env.REPOSITORY ?? '';
const sourcePr = Number(process.env.SOURCE_PR ?? 0);
if (!repository || !sourcePr) {
  console.error('REPOSITORY and SOURCE_PR are required.');
  process.exit(1);
}

const run = (command, args, { allowFailure = false } = {}) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
};
const git = (...args) => run('git', args);
const gh = (...args) => run('gh', args);

const pr = JSON.parse(gh('pr', 'view', String(sourcePr), '--repo', repository, '--json', 'title,body,url,labels,mergeCommit,baseRefName,state'));
if (pr.state !== 'MERGED' || pr.baseRefName !== 'main' || !pr.mergeCommit?.oid) {
  console.log(`PR #${sourcePr} is not merged into main; nothing to backport.`);
  process.exit(0);
}

const requested = (process.env.LINES ?? '').split(',').map((line) => line.trim()).filter(Boolean);
const lines = requested.length ? requested : linesFromLabels(pr.labels.map((label) => label.name));
if (!lines.length) {
  console.log(`PR #${sourcePr} has no backport-N.x label.`);
  process.exit(0);
}

const sha = pr.mergeCommit.oid;
const parents = git('rev-list', '--parents', '-n', '1', sha).split(' ').length - 1;
const dir = mkdtempSync(path.join(tmpdir(), 'backport-'));

const comment = (text) => gh('pr', 'comment', String(sourcePr), '--repo', repository, '--body', text);
const ensureLabel = (name, color, description) => run('gh', ['label', 'create', name, '--repo', repository, '--color', color, '--description', description], { allowFailure: true });
const remoteBranchExists = (name) => run('git', ['ls-remote', '--exit-code', '--heads', 'origin', name], { allowFailure: true }) !== null;

/** Returns { message, notify } when this line should be skipped (notify = tell the source PR), or null to go ahead. */
const skipReason = (line, stable, branch) => {
  if (!remoteBranchExists(stable)) return { message: `No \`${stable}\` branch exists, so \`backport-${line}\` was skipped.`, notify: true };
  const existing = JSON.parse(gh('pr', 'list', '--repo', repository, '--head', branch, '--state', 'all', '--json', 'number,url'));
  if (existing.length) return { message: `${branch} already has #${existing[0].number}; leaving it unchanged.`, notify: false };
  if (remoteBranchExists(branch)) throw new Error(`${branch} already exists without a matching PR; refusing to overwrite it.`);
  return null;
};

const openPr = ({ line, stable, branch, title, conflicts }) => {
  const bodyFile = path.join(dir, `${branch.replace('/', '-')}.md`);
  writeFileSync(bodyFile, backportBody({ sourcePr, sourceUrl: pr.url, line, sourceBody: pr.body ?? '', conflicts }));
  ensureLabel('backport', 'c5def5', 'Backport of a main PR to a stable line');
  if (conflicts.length) ensureLabel('backport-conflict', 'B60205', 'Backport has conflicts to resolve on its branch');
  return gh(
    'pr', 'create', '--repo', repository, '--base', stable, '--head', branch, '--title', title, '--body-file', bodyFile,
    '--label', conflicts.length ? 'backport,backport-conflict' : 'backport',
    ...(conflicts.length ? ['--draft'] : []),
  );
};

const announce = (stable, url, conflicts) => comment(conflicts.length
  ? `Backport to \`${stable}\` opened as a draft with conflicts in ${conflicts.map((file) => `\`${file}\``).join(', ')}: ${url}`
  : `Backport to \`${stable}\` opened: ${url}`);

const backportOne = (line) => {
  const stable = stableBranchForLine(line);
  const branch = backportBranch(sourcePr, line);
  const skip = skipReason(line, stable, branch);
  if (skip) {
    console.log(skip.message);
    if (skip.notify) comment(skip.message);
    return;
  }

  git('fetch', 'origin', stable);
  git('switch', '--create', branch, `origin/${stable}`);
  const { conflicts, empty } = pickWithoutChangelog(run, sha, parents);
  if (empty) {
    comment(`Nothing to backport to \`${stable}\`: the change is already there or touches only \`CHANGELOG.md\`.`);
    return;
  }

  const title = backportTitle(pr.title, sourcePr, line);
  git('commit', '--message', `${title}

(cherry picked from commit ${sha})`);
  git('push', '--set-upstream', 'origin', branch);
  announce(stable, openPr({ line, stable, branch, title, conflicts }), conflicts);
};

let failed = false;
for (const line of lines) {
  try {
    backportOne(line);
  } catch (error) {
    failed = true;
    console.error(`::error::Backport of #${sourcePr} to ${line} failed: ${error.message}`);
  } finally {
    run('git', ['reset', '--hard'], { allowFailure: true });
    run('git', ['switch', '--detach', 'origin/main'], { allowFailure: true });
  }
}
process.exitCode = failed ? 1 : 0;
