import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { deriveStableVersion, releaseBranchForStable } from './lib/package-version.mjs';

const packagePath = 'package.json';
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const original = pkg.version;
const stable = deriveStableVersion(original);

if (!stable) {
  console.error(`Cannot prepare main release from package version "${original}".`);
  process.exit(1);
}

if (stable !== original) {
  pkg.version = stable;
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Updated package.json version: ${original} -> ${stable}`);
} else {
  console.log(`package.json already at stable version ${stable}`);
}

const releaseBranch = releaseBranchForStable(stable);
const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `stable_version=${stable}\n`);
  appendFileSync(outputPath, `release_branch=${releaseBranch}\n`);
  appendFileSync(outputPath, `beta_version=${original}\n`);
}

console.log(`Release branch: ${releaseBranch}`);
