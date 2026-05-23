import { readFileSync, writeFileSync } from 'node:fs';
import { bumpVersionForMergeTarget } from './lib/version-bump.mjs';

const target = process.argv[2];
const packagePath = 'package.json';

if (target !== 'beta' && target !== 'main') {
  console.error('Usage: node scripts/apply-version-bump.mjs <beta|main>');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const previous = pkg.version;
const next = bumpVersionForMergeTarget(previous, target);

if (!next) {
  console.error(`Cannot bump ${target} version from "${previous}".`);
  process.exit(1);
}

pkg.version = next;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Bumped package.json: ${previous} -> ${next} (target ${target})`);
