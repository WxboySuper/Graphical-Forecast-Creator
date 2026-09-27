import { appendFileSync } from 'node:fs';
import { evaluateChangelogReleaseGate } from './lib/opencode-changelog-release-gate.mjs';

const decision = evaluateChangelogReleaseGate({
  auditResult: process.env.AUDIT_RESULT,
  auditStatus: process.env.AUDIT_STATUS,
  targetRef: process.env.TARGET_REF,
  auditedHead: process.env.AUDITED_HEAD,
});
if (!decision.ready) {
  console.error(`::error::${decision.message}`);
  process.exit(1);
}
console.log(decision.message);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Final changelog gate\n\n${decision.message}\n`);
