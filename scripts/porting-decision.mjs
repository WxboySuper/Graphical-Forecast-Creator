import { resolvePortTargets, shouldSkipPorting } from './lib/port-targets.mjs';

const baseBranch = process.env.BASE_BRANCH ?? '';
const sourceBranch = process.env.SOURCE_BRANCH ?? '';
const sourcePrNumber = Number(process.env.PR_NUMBER ?? '0');
const labels = (process.env.PR_LABELS ?? '')
  .split(',')
  .map((label) => label.trim())
  .filter(Boolean);

let openBetaPrs = [];
if (process.env.OPEN_BETA_PRS_JSON) {
  openBetaPrs = JSON.parse(process.env.OPEN_BETA_PRS_JSON);
}

const skip = shouldSkipPorting({
  labels,
  openBetaPrs,
  sourcePrNumber,
  sourceBranch,
});

const targets = skip.skip ? [] : resolvePortTargets({ baseBranch, sourceBranch });

process.stdout.write(
  JSON.stringify({
    skip: skip.skip,
    skipReason: skip.reason ?? null,
    manualPr: skip.manualPr ?? null,
    targets,
  }),
);
