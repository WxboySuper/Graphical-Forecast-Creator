/**
 * The git half of a backport: cherry-pick a main merge commit onto the checked-out stable branch without
 * committing, keep main's CHANGELOG.md out of it, and report what is left. `run` is
 * (command, args, { allowFailure }) => stdout | null, so tests can use real git in a temp repo.
 */

/** Puts CHANGELOG.md back to the stable branch's version, or removes it when the branch has none. */
const dropChangelog = (run) => {
  if (run('git', ['checkout', 'HEAD', '--', 'CHANGELOG.md'], { allowFailure: true }) === null) {
    run('git', ['rm', '-f', '-q', '--', 'CHANGELOG.md'], { allowFailure: true });
  }
};

/** Names of files still in conflict. */
const conflictedFiles = (run) => (run('git', ['diff', '--name-only', '--diff-filter=U']) ?? '').split('\n').filter(Boolean);

/**
 * Applies the pick and stages everything, conflict markers included, so the result can be committed as is.
 * @returns {{ conflicts: string[]; empty: boolean }} empty means nothing is left to commit
 */
export const pickWithoutChangelog = (run, sha, parents) => {
  run('git', ['cherry-pick', '--no-commit', ...(parents > 1 ? ['-m', '1'] : []), sha], { allowFailure: true });
  dropChangelog(run);
  const conflicts = conflictedFiles(run);
  run('git', ['add', '--all']);
  const empty = run('git', ['diff', '--cached', '--quiet'], { allowFailure: true }) !== null;
  return { conflicts, empty };
};
