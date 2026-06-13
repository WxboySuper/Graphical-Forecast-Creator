import { readFileSync, writeFileSync } from 'node:fs';
import { takeBetaChangelogEntries } from './lib/beta-changelog.mjs';

const prNumbers = process.argv.slice(2).map(Number);
if (prNumbers.length === 0 || prNumbers.some((value) => !Number.isInteger(value) || value <= 0)) {
  console.error('Usage: node scripts/consolidate-beta-changelog.mjs <pr-number> [...]');
  process.exit(1);
}

const betaPath = 'CHANGELOG.beta.md';
const productionPath = 'CHANGELOG.md';
const beta = readFileSync(betaPath, 'utf8');
const production = readFileSync(productionPath, 'utf8');
const result = takeBetaChangelogEntries(beta, prNumbers);
const heading = '### Changed';
const bullets = result.entries.map((entry) => `- ${entry}`).join('\n');
const activeSection = production.match(/^## (?:\[?Unreleased\]?|v[\d.]+).*$/m);
if (!activeSection?.index && activeSection?.index !== 0) {
  throw new Error('CHANGELOG.md needs an Unreleased or version section before consolidation.');
}
const sectionStart = activeSection.index;
const sectionTail = production.slice(sectionStart);
const nextSectionOffset = sectionTail.slice(activeSection[0].length).search(/\n## /);
const sectionEnd = nextSectionOffset === -1
  ? production.length
  : sectionStart + activeSection[0].length + nextSectionOffset;
const sectionBody = production.slice(sectionStart, sectionEnd);
const changedHeadingIndex = sectionBody.indexOf(heading);
const nextSectionBody = changedHeadingIndex === -1
  ? `${activeSection[0]}\n\n${heading}\n${bullets}\n${sectionBody.slice(activeSection[0].length).trimStart()}`
<<<<<<< HEAD
  : sectionBody.replace(heading, `${heading}\n${bullets}`);
=======
  : sectionBody.replace(heading, () => `${heading}\n${bullets}`);
>>>>>>> origin/pr/509
const nextProduction = production.slice(0, sectionStart) + nextSectionBody + production.slice(sectionEnd);

writeFileSync(betaPath, result.changelog);
writeFileSync(productionPath, nextProduction);
console.log(`Consolidated beta changelog entries for PRs: ${prNumbers.join(', ')}`);
