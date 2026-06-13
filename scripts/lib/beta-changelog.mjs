export const BETA_CHANGELOG_PATH = 'CHANGELOG.beta.md';

/** Builds the canonical heading for one beta changelog PR entry. */
const entryHeading = (prNumber) => `### PR #${prNumber}`;

/** Rejects incomplete data before an entry is formatted. */
const validateEntryInput = (prNumber, bullets) => {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
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
  const start = changelog.indexOf(heading);
  if (start === -1) return null;
  const rest = changelog.slice(start + heading.length);
  const next = rest.search(/\n### PR #|\n## /);
  const body = (next === -1 ? rest : rest.slice(0, next)).trim();
  return body ? `${heading}\n\n${body}` : null;
};

/** Validates that a beta PR has exactly one non-empty bullet entry. */
export const betaChangelogTouchesPr = (changedFiles, changelog, prNumber) => {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
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
  const occurrences = changelog.split(entryHeading(prNumber)).length - 1;
  if (occurrences !== 1) {
    return { ok: false, reason: `${entryHeading(prNumber)} must appear exactly once.` };
  }
  return { ok: true, reason: `${BETA_CHANGELOG_PATH} documents PR #${prNumber}.` };
};

/** Inserts or replaces one PR entry under Unreleased. */
export const upsertBetaChangelogEntry = (changelog, prNumber, bullets) => {
  validateEntryInput(prNumber, bullets);
  const entry = formatEntry(prNumber, bullets);
  const existing = extractBetaChangelogEntry(changelog, prNumber);
  if (existing) return changelog.replace(existing, entry);
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
  return { changelog: `${next.trimEnd()}\n`, entries };
};
