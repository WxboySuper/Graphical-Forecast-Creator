#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildStaleBranchReport,
  formatStaleBranchReport,
} from './lib/stale-branch-report.mjs';
import {
  fetchStaleBranchInputs,
  loadFixtureInputs,
  upsertStaleBranchReportIssue,
} from './lib/stale-branch-github.mjs';

/**
 * @param {string} repository
 * @param {string} runId
 */
function buildRunUrl(repository, runId) {
  if (!repository || !runId) {
    return undefined;
  }
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

/**
 * @param {string} body
 */
function writeStepSummary(body) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  appendFileSync(summaryPath, `${body}\n`, 'utf8');
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   repository?: string,
 *   token?: string,
 *   runId?: string,
 *   publishIssue?: boolean,
 * }} [options]
 */
export async function runStaleBranchReport(options = {}) {
  const dryRun = options.dryRun ?? process.env.DRY_RUN === '1';
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY ?? '';
  const token = options.token ?? process.env.GITHUB_TOKEN ?? '';
  const runId = options.runId ?? process.env.GITHUB_RUN_ID ?? '';
  const publishIssue = options.publishIssue ?? true;
  const publishErrors = [];

  let inputs;
  if (dryRun) {
    inputs = await loadFixtureInputs();
  } else {
    if (!repository || !token) {
      throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required unless DRY_RUN=1.');
    }
    inputs = await fetchStaleBranchInputs({ repository, token });
  }

  const report = buildStaleBranchReport(inputs);
  const body = formatStaleBranchReport({
    ...report,
    errors: [...(inputs.errors ?? []), ...publishErrors],
    runUrl: buildRunUrl(repository, runId),
    repository: repository || undefined,
  });

  console.log(body);

  writeStepSummary(body);

  if (!dryRun && publishIssue && repository && token) {
    try {
      const result = await upsertStaleBranchReportIssue({ repository, token, body });
      console.log(`Stale branch report issue ${result.action} (#${result.issueNumber}).`);
    } catch (error) {
      const message = `Failed to upsert stale branch report issue: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(message);
      publishErrors.push(message);
      writeStepSummary(`\n### Publish errors\n\n- ${message}\n`);
    }
  } else if (!dryRun && publishIssue) {
    console.log('Skipping issue upsert (GITHUB_REPOSITORY or GITHUB_TOKEN unset).');
  }

  return { report, body, dryRun };
}

async function main() {
  try {
    await runStaleBranchReport();
  } catch (error) {
    const message = `Stale branch report failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    writeStepSummary(`### Stale branch report failed\n\n${message}\n`);
    process.exitCode = 0;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
