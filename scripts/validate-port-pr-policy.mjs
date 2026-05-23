import { execFileSync } from 'node:child_process';
import {
  evaluatePortPrPolicy,
  parsePortBranch,
  targetBranchFromSlug,
} from './lib/port-pr-policy.mjs';

const headRef = process.env.GITHUB_HEAD_REF ?? '';
const baseRef = process.env.GITHUB_BASE_REF ?? '';

const parsed = parsePortBranch(headRef);
if (!parsed) {
  console.log('Not a port/* branch; skipping port PR policy.');
  process.exit(0);
}

const sourcePrJson = execFileSync(
  'gh',
  [
    'pr',
    'view',
    String(parsed.sourcePrNumber),
    '--repo',
    process.env.GITHUB_REPOSITORY ?? '',
    '--json',
    'headRefName,baseRefName',
  ],
  { encoding: 'utf8' },
);

const sourcePr = JSON.parse(sourcePrJson);
const result = evaluatePortPrPolicy({
  headRef,
  baseRef,
  targetBranch: targetBranchFromSlug(parsed.targetSlug),
  sourcePrHeadRef: sourcePr.headRefName,
  sourcePrBaseRef: sourcePr.baseRefName,
  sourcePrNumber: parsed.sourcePrNumber,
});

if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

console.log(`Port PR policy OK: ${headRef} → ${baseRef}.`);
