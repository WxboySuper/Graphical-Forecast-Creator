import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  auditAdvisories,
  fixableHighAdvisories,
  parseAuditReport,
} from './lib/dependency-audit-report.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Runs `pnpm audit` and fails only on high/critical advisories that have an
 * available fix. Advisories with no patched release (fixAvailable absent or
 * false) are reported but do not fail the gate, so a known-unfixable transitive
 * finding cannot block CI indefinitely while a maintainer tracks an upstream fix.
 *
 * Only stdout is parsed. stderr carries pnpm warnings and must never be mixed
 * into the JSON body. When no report can be read, or pnpm reports an error
 * instead of advisories, the gate fails instead of passing with an unevaluated
 * dependency tree.
 */

/** Reads the audit report from a finished run, exiting when none was produced. */
const readReport = (result) => {
  const report = parseAuditReport(result.stdout ?? '');
  if (report) return report;

  console.error('Dependency audit did not return a JSON report; failing the gate instead of skipping it.');
  const stderr = (result.stderr ?? '').trim();
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
};

/** Exits when pnpm reported an error body instead of advisories. */
const assertAuditCompleted = (report) => {
  if (!report.error) return;
  const summary = report.error.summary ?? report.error.code ?? 'unknown error';
  console.error(`Dependency audit could not complete: ${summary}`);
  process.exit(1);
};

/** Logs every advisory with its fix status. */
const logAdvisories = (advisories) => {
  for (const ad of advisories) {
    const fixStatus = ad.fixAvailable ? 'fix available' : 'no fix available';
    console.log(`  ${ad.severity}: ${ad.module_name} (${ad.title}) — ${fixStatus}`);
  }
};

/** Exits with the fixable high/critical findings listed. */
const failOnFixableAdvisories = (fixableHigh) => {
  console.error(`Dependency audit FAILED: ${fixableHigh.length} fixable high/critical advisory(ies).`);
  for (const ad of fixableHigh) {
    console.error(`  - ${ad.module_name}: ${ad.title}`);
  }
  process.exit(1);
};

const main = () => {
  const result = spawnSync('pnpm', ['audit', '--audit-level=high', '--ignore-registry-errors', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });

  const report = readReport(result);
  assertAuditCompleted(report);

  const advisories = auditAdvisories(report);
  const fixableHigh = fixableHighAdvisories(report);
  logAdvisories(advisories);

  if (fixableHigh.length > 0) {
    failOnFixableAdvisories(fixableHigh);
  }

  console.log(`Dependency audit OK: ${advisories.length} advisory(ies), none fixable at high/critical.`);
  process.exit(0);
};

main();
