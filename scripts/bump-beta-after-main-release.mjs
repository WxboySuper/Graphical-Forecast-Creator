import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { deriveStableVersion } from './lib/package-version.mjs';

const stableInput = process.argv[2] ?? process.env.STABLE_VERSION ?? '';
const packagePath = 'package.json';

const stable = stableInput.trim();
if (!stable) {
  console.error('Provide stable version as argv[2] (e.g. 1.6.0).');
  process.exit(1);
}

const normalized = deriveStableVersion(stable) ?? stable;
const parts = normalized.split('.').map(Number);
if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
  console.error(`Invalid stable version "${stable}".`);
  process.exit(1);
}

const nextBeta = `${parts[0]}.${parts[1] + 1}.0-beta.1`;
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const previous = pkg.version;
pkg.version = nextBeta;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `previous_beta_version=${previous}\n`);
  appendFileSync(outputPath, `next_beta_version=${nextBeta}\n`);
  appendFileSync(outputPath, `stable_version=${normalized}\n`);
}

console.log(`Updated beta package.json: ${previous} -> ${nextBeta} (after main release ${normalized})`);
