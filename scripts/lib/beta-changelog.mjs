export const BETA_CHANGELOG_PATH = 'CHANGELOG.beta.md';

<<<<<<< HEAD
/** Builds the canonical heading for one beta changelog PR entry. */
const entryHeading = (prNumber) => `### PR #${prNumber}`;

/** Matches a complete PR heading without treating #50 as #500. */
const entryHeadingPattern = (prNumber, flags = '') => (
  new RegExp(`^${entryHeading(prNumber)}(?!\\d)`, flags.includes('m') ? flags : `${flags}m`)
);

/** Reports whether a value can identify a GitHub pull request. */
const isValidPrNumber = (prNumber) => Number.isInteger(prNumber) && prNumber > 0;

/** Counts complete headings for one PR without matching numeric prefixes. */
const countEntryHeadings = (changelog, prNumber) => (
  [...changelog.matchAll(entryHeadingPattern(prNumber, 'g'))].length
);

/** Rejects incomplete data before an entry is formatted. */
const validateEntryInput = (prNumber, bullets) => {
  if (!isValidPrNumber(prNumber)) {
    throw new Error('A positive PR number is required.');
  }
  if (!Array.isArray(bullets) || bullets.length === 0) {
    throw new Error('At least one beta changelog bullet is required.');
  }
  if (bullets.some((bullet) => !bullet.trim())) {
    throw new Error('Beta changelog bullets cannot be empty.');
  }
};

/** Formats normalized input as one machine-parseable PR section. */
const formatEntry = (prNumber, bullets) => {
  const body = bullets
    .map((bullet) => `- ${bullet.replace(/^[-*]\s*/, '')}`)
    .join('\n');
  return `${entryHeading(prNumber)}\n\n${body}`;
};

/** Returns one PR entry body, or null when it is missing. */
export const extractBetaChangelogEntry = (changelog, prNumber) => {
  const heading = entryHeading(prNumber);
  const match = entryHeadingPattern(prNumber).exec(changelog);
  const start = match?.index ?? -1;
=======
const entryHeading = (prNumber) => `### PR #${prNumber}`;

/** Returns one PR entry body, or null when it is missing. */
export const extractBetaChangelogEntry = (changelog, prNumber) => {
  const heading = entryHeading(prNumber);
  const start = changelog.indexOf(heading);
>>>>>>> 475055d (feat(governance): add beta changelog workflow)
  if (start === -1) return null;
  const rest = changelog.slice(start + heading.length);
  const next = rest.search(/\n### PR #|\n## /);
  const body = (next === -1 ? rest : rest.slice(0, next)).trim();
  return body ? `${heading}\n\n${body}` : null;
};

/** Validates that a beta PR has exactly one non-empty bullet entry. */
export const betaChangelogTouchesPr = (changedFiles, changelog, prNumber) => {
<<<<<<< HEAD
  if (!isValidPrNumber(prNumber)) {
=======
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
>>>>>>> 475055d (feat(governance): add beta changelog workflow)
    return { ok: false, reason: 'A valid PR_NUMBER is required for beta changelog validation.' };
  }
  if (!changedFiles.includes(BETA_CHANGELOG_PATH)) {
    return { ok: false, reason: `PRs targeting beta must update ${BETA_CHANGELOG_PATH}.` };
  }
  const entry = extractBetaChangelogEntry(changelog, prNumber);
  if (!entry || !/^\s*[-*]\s+\S/m.test(entry)) {
    return {
      ok: false,
      reason: `${BETA_CHANGELOG_PATH} must include ${entryHeading(prNumber)} with at least one bullet.`,
    };
  }
<<<<<<< HEAD
  const occurrences = countEntryHeadings(changelog, prNumber);
=======
  const occurrences = changelog.split(entryHeading(prNumber)).length - 1;
>>>>>>> 475055d (feat(governance): add beta changelog workflow)
  if (occurrences !== 1) {
    return { ok: false, reason: `${entryHeading(prNumber)} must appear exactly once.` };
  }
  return { ok: true, reason: `${BETA_CHANGELOG_PATH} documents PR #${prNumber}.` };
};

/** Inserts or replaces one PR entry under Unreleased. */
export const upsertBetaChangelogEntry = (changelog, prNumber, bullets) => {
<<<<<<< HEAD
  validateEntryInput(prNumber, bullets);
  const entry = formatEntry(prNumber, bullets);
  const existing = extractBetaChangelogEntry(changelog, prNumber);
  if (existing) return changelog.replace(existing, () => entry);
=======
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('A positive PR number is required.');
  }
  if (!Array.isArray(bullets) || bullets.length === 0 || bullets.some((bullet) => !bullet.trim())) {
    throw new Error('At least one non-empty beta changelog bullet is required.');
  }
  const heading = entryHeading(prNumber);
  const entry = `${heading}\n\n${bullets.map((bullet) => `- ${bullet.replace(/^[-*]\s*/, '')}`).join('\n')}`;
  const existing = extractBetaChangelogEntry(changelog, prNumber);
  if (existing) return changelog.replace(existing, entry);
>>>>>>> 475055d (feat(governance): add beta changelog workflow)
  const unreleased = '## Unreleased';
  const index = changelog.indexOf(unreleased);
  if (index === -1) throw new Error(`${BETA_CHANGELOG_PATH} must include ${unreleased}.`);
  const insertAt = index + unreleased.length;
  return `${changelog.slice(0, insertAt)}\n\n${entry}\n${changelog.slice(insertAt).replace(/^\s*/, '')}`;
};

/** Removes selected entries and returns their bullet text for release editing. */
export const takeBetaChangelogEntries = (changelog, prNumbers) => {
  const entries = [];
  let next = changelog;
  for (const prNumber of prNumbers) {
    const entry = extractBetaChangelogEntry(next, prNumber);
    if (!entry) throw new Error(`Missing beta changelog entry for PR #${prNumber}.`);
    entries.push(...entry.split('\n').filter((line) => /^[-*]\s+/.test(line)).map((line) => line.replace(/^[-*]\s+/, '')));
    next = next.replace(entry, '').replace(/\n{3,}/g, '\n\n');
  }
<<<<<<< HEAD
  return { changelog: `${next.trimEnd()}\n`, entries };
=======
  return { changelog: next.trimEnd() + '\n', entries };
>>>>>>> 475055d (feat(governance): add beta changelog workflow)
};
