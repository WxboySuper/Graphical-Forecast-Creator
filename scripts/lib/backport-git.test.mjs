import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pickWithoutChangelog } from './backport-git.mjs';

/** A repo with main and stable branches; `mainChange` is applied on main and its commit is returned with the repo. */
const setup = ({ stableFiles, mainFiles }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'backport-git-'));
  const run = (command, args, { allowFailure = false } = {}) => {
    try {
      return execFileSync(command, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
      if (allowFailure) return null;
      throw error;
    }
  };
  const write = (files) => {
    for (const [name, content] of Object.entries(files)) {
      if (content === null) run('git', ['rm', '-q', '--', name]);
      else writeFileSync(path.join(dir, name), content);
    }
    run('git', ['add', '--all']);
  };
  run('git', ['init', '-q', '-b', 'main']);
  run('git', ['config', 'user.email', 't@example.com']);
  run('git', ['config', 'user.name', 'test']);
  run('git', ['config', 'core.autocrlf', 'false']);
  write({ 'CHANGELOG.md': 'top\nlane\n', 'app.txt': 'one\n' });
  run('git', ['commit', '-qm', 'base']);
  run('git', ['switch', '-qc', 'stable']);
  write(stableFiles);
  run('git', ['commit', '-qm', 'stable', '--allow-empty']);
  run('git', ['switch', '-q', 'main']);
  write(mainFiles);
  run('git', ['commit', '-qm', 'feature']);
  const sha = run('git', ['rev-parse', 'HEAD']);
  run('git', ['switch', '-q', 'stable']);
  return { dir, run, sha };
};

const cleanup = ({ dir }) => rmSync(dir, { recursive: true, force: true });

describe('pickWithoutChangelog', () => {
  it('applies a clean pick and leaves the stable CHANGELOG.md alone', () => {
    const repo = setup({ stableFiles: { 'CHANGELOG.md': 'top\nstable-entry\n' }, mainFiles: { 'app.txt': 'two\n', 'CHANGELOG.md': 'top\nmain-entry\n' } });
    const result = pickWithoutChangelog(repo.run, repo.sha, 1);
    assert.deepEqual(result, { conflicts: [], empty: false });
    assert.equal(repo.run('git', ['show', ':CHANGELOG.md']), 'top\nstable-entry');
    assert.equal(repo.run('git', ['show', ':app.txt']), 'two');
    cleanup(repo);
  });

  it('does not abort when only CHANGELOG.md conflicts, and reports an empty pick when nothing else changed', () => {
    const repo = setup({ stableFiles: { 'CHANGELOG.md': 'top\nstable-entry\n' }, mainFiles: { 'CHANGELOG.md': 'top\nmain-entry\n' } });
    const result = pickWithoutChangelog(repo.run, repo.sha, 1);
    assert.deepEqual(result, { conflicts: [], empty: true });
    cleanup(repo);
  });

  it('reports real conflicts in code files and stages their markers', () => {
    const repo = setup({ stableFiles: { 'app.txt': 'stable\n' }, mainFiles: { 'app.txt': 'two\n', 'CHANGELOG.md': 'top\nmain-entry\n' } });
    const result = pickWithoutChangelog(repo.run, repo.sha, 1);
    assert.deepEqual(result.conflicts, ['app.txt']);
    assert.equal(result.empty, false);
    assert.match(repo.run('git', ['show', ':app.txt']), /<<<<<<</);
    cleanup(repo);
  });

  it('does not abort when the stable branch has no CHANGELOG.md', () => {
    const repo = setup({ stableFiles: { 'CHANGELOG.md': null }, mainFiles: { 'app.txt': 'two\n', 'CHANGELOG.md': 'top\nmain-entry\n' } });
    const result = pickWithoutChangelog(repo.run, repo.sha, 1);
    assert.deepEqual(result, { conflicts: [], empty: false });
    assert.equal(repo.run('git', ['ls-files', '--', 'CHANGELOG.md']), '');
    assert.equal(repo.run('git', ['show', ':app.txt']), 'two');
    cleanup(repo);
  });

  it('leaves no cherry-pick state behind, so the next line in a multi-line run still works', () => {
    const repo = setup({ stableFiles: { 'app.txt': 'stable\n' }, mainFiles: { 'app.txt': 'two\n' } });
    // The same cleanup scripts/backport.mjs runs between lines.
    const cleanBetweenLines = () => {
      repo.run('git', ['reset', '--hard'], { allowFailure: true });
      repo.run('git', ['switch', '--detach', 'main'], { allowFailure: true });
    };
    repo.run('git', ['branch', 'stable-2', 'stable']);

    const first = pickWithoutChangelog(repo.run, repo.sha, 1);
    assert.deepEqual(first.conflicts, ['app.txt']);
    cleanBetweenLines();
    assert.equal(repo.run('git', ['rev-parse', '--verify', '-q', 'CHERRY_PICK_HEAD'], { allowFailure: true }), null);

    repo.run('git', ['switch', '-q', 'stable-2']);
    const second = pickWithoutChangelog(repo.run, repo.sha, 1);
    assert.deepEqual(second.conflicts, ['app.txt']);
    assert.equal(second.empty, false);
    cleanup(repo);
  });
});
