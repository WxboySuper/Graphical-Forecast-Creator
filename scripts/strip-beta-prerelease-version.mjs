import { readFileSync, writeFileSync } from 'node:fs';

const packagePath = 'package.json';
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const original = pkg.version;

const stable = original.replace(/-beta(\.[0-9A-Za-z.-]*)?$/i, '');
if (stable === original) {
  console.log(`Version "${original}" is already a stable release identifier.`);
  process.exit(0);
}

if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(stable)) {
  console.error(`Cannot derive stable version from "${original}".`);
  process.exit(1);
}

pkg.version = stable;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Updated package.json version: ${original} -> ${stable}`);
