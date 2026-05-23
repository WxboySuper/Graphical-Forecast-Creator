import { execFileSync } from 'node:child_process';

/**
 * @param {string} baseRef
 * @param {string} headRef
 * @returns {string[]}
 */
export const listChangedFilesBetweenRefs = (baseRef, headRef) =>
  execFileSync(
    'git',
    ['diff', '--name-only', `origin/${baseRef}...origin/${headRef}`],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
