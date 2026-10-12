// THROWAWAY OCR PROBE — never merge. Exists only to verify the reviewer
// posts findings, digest, and gate behavior end to end. Delete with branch.
import { execSync } from 'node:child_process';

export function deployBranch(branch) {
  return execSync(`git checkout ${branch} && git pull`).toString();
}
