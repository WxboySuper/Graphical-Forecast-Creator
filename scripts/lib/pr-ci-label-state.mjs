/** @typedef {{ status: string; conclusion: string | null }} CheckRun */

const CI_LABELS = ['ci:pending', 'ci:passing', 'ci:failing'];

const ACTIVE_STATUSES = new Set(['queued', 'in_progress', 'pending', 'waiting']);

const FAILED_CONCLUSIONS = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'stale',
]);

/**
 * Derive the CI status label from the latest check runs on a commit.
 * @param {CheckRun[]} checkRuns
 * @returns {'ci:pending' | 'ci:passing' | 'ci:failing'}
 */
export function ciLabelFromCheckRuns(checkRuns) {
  if (!checkRuns?.length) {
    return 'ci:pending';
  }

  if (checkRuns.some((run) => ACTIVE_STATUSES.has(run.status))) {
    return 'ci:pending';
  }

  if (
    checkRuns.some(
      (run) => run.status === 'completed' && FAILED_CONCLUSIONS.has(run.conclusion ?? ''),
    )
  ) {
    return 'ci:failing';
  }

  const allCompleted = checkRuns.every((run) => run.status === 'completed');
  if (!allCompleted) {
    return 'ci:pending';
  }

  const allOk = checkRuns.every((run) =>
    ['success', 'neutral', 'skipped'].includes(run.conclusion ?? ''),
  );
  return allOk ? 'ci:passing' : 'ci:failing';
}

/**
 * @param {string[]} existingLabels
 * @param {'ci:pending' | 'ci:passing' | 'ci:failing'} desired
 * @returns {{ add: string[]; remove: string[] }}
 */
export function diffCiLabels(existingLabels, desired) {
  const remove = CI_LABELS.filter((name) => existingLabels.includes(name) && name !== desired);
  const add = existingLabels.includes(desired) ? [] : [desired];
  return { add, remove };
}

export { CI_LABELS };
