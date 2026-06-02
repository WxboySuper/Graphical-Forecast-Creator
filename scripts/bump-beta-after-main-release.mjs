import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { computeBetaVersionAfterMainRelease } from './lib/bump-beta-after-main-release.mjs';

const stableInput = process.argv[2] ?? process.env.STABLE_VERSION ?? '';
const currentBetaInput =
  process.argv[3] ?? process.env.CURRENT_BETA_VERSION ?? '';
const packagePath = 'package.json';

const stable = stableInput.trim();
if (!stable) {
  console.error('Provide stable version as argv[2] (e.g. 1.6.0).');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
<<<<<<< HEAD
const previous = currentBetaInput.trim() || pkg.version;
=======
const previous = pkg.version;
>>>>>>> 8f39310 (fix(release): preserve beta line when main stable is behind beta)
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
<<<<<<< HEAD
  if (pkg.version !== previous) {
    pkg.version = previous;
    writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(
      `Restored beta package.json to ${previous} after merge (main stable ${stable}; ${result.reason})`,
    );
  } else {
    console.log(
      `Keeping beta package.json at ${previous} (main stable ${stable}; ${result.reason})`,
    );
  }
=======
  console.log(
    `Keeping beta package.json at ${previous} (main stable ${stable}; ${result.reason})`,
  );
>>>>>>> 8f39310 (fix(release): preserve beta line when main stable is behind beta)
  process.exit(0);
}

pkg.version = result.next;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(
  `Updated beta package.json: ${previous} -> ${result.next} (after main release ${stable}; ${result.reason})`,
);
