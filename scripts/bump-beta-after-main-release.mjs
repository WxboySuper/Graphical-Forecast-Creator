import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { computeBetaVersionAfterMainRelease } from './lib/bump-beta-after-main-release.mjs';

const stableInput = process.argv[2] ?? process.env.STABLE_VERSION ?? '';
const packagePath = 'package.json';

const stable = stableInput.trim();
if (!stable) {
  console.error('Provide stable version as argv[2] (e.g. 1.6.0).');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const previous = pkg.version;
const result = computeBetaVersionAfterMainRelease(stable, previous);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `previous_beta_version=${previous}\n`);
  appendFileSync(outputPath, `next_beta_version=${result.next}\n`);
  appendFileSync(outputPath, `stable_version=${stable}\n`);
  appendFileSync(outputPath, `beta_version_changed=${result.changed}\n`);
  appendFileSync(outputPath, `beta_bump_reason=${result.reason}\n`);
}

if (!result.changed) {
  console.log(
    `Keeping beta package.json at ${previous} (main stable ${stable}; ${result.reason})`,
  );
  process.exit(0);
}

pkg.version = result.next;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(
  `Updated beta package.json: ${previous} -> ${result.next} (after main release ${stable}; ${result.reason})`,
);
