import { evaluateBranchPolicy } from './lib/branch-policy.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping branch policy check.');
  process.exit(0);
}

const result = evaluateBranchPolicy({ baseRef, headRef });

if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

console.log(`Branch policy OK: ${headRef} → ${baseRef} (${result.kind}).`);
