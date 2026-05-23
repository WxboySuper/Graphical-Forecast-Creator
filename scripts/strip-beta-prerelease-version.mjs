import { readFileSync, writeFileSync } from 'node:fs';
import { deriveStableVersion } from './lib/package-version.mjs';

const packagePath = 'package.json';
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const original = pkg.version;

const stable = deriveStableVersion(original);
if (!stable) {
  if (original.replace(/-beta(\.[0-9A-Za-z.-]*)?$/i, '') === original) {
    console.log(`Version "${original}" is already a stable release identifier.`);
    process.exit(0);
  }
  console.error(`Cannot derive stable version from "${original}".`);
  process.exit(1);
}

if (stable === original) {
  console.log(`Version "${original}" is already a stable release identifier.`);
  process.exit(0);
}

pkg.version = stable;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Updated package.json version: ${original} -> ${stable}`);
