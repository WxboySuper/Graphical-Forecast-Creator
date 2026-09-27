const SECTIONS = new Set(['Added', 'Changed', 'Fixed', 'Security']);
const ENTRY_PATTERN = /^- \*\*[^*\r\n]{1,80}:\*\* [^\r\n<>]{15,450}$/u;

const decodeModelResult = (raw) => {
  if (typeof raw !== 'string' || raw.length > 16_000) throw new Error('OpenCode changelog result is empty or too large.');
  try { return JSON.parse(raw); } catch { throw new Error('OpenCode changelog result must be JSON.'); }
};

const normalizeModelEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 4) {
    throw new Error('OpenCode changelog must contain one to four entries.');
  }
  const normalized = entries.map((entry) => String(entry).trim());
  const invalid = normalized.some((entry) => !ENTRY_PATTERN.test(entry) || /[\x60<>]|\[|\]|\(|\)|https?:\/\//i.test(entry));
  if (invalid) throw new Error('OpenCode returned an entry outside the allowed changelog format or size.');
  return normalized;
};

const validateModelEntries = (result) => {
  if (!SECTIONS.has(result.section)) throw new Error('OpenCode changelog section is invalid.');
  const entries = normalizeModelEntries(result.entries);
  if (new Set(entries).size !== entries.length) throw new Error('OpenCode returned duplicate changelog entries.');
  return entries;
};

/** Parse and bound the untrusted model response. */
export const parseOpenCodeChangelogResult = (raw) => {
  const result = decodeModelResult(raw);
  if (!result || !['complete', 'inconclusive'].includes(result.status)) throw new Error('OpenCode changelog status is invalid.');
  if (result.status === 'inconclusive') return { status: 'inconclusive' };
  return { status: 'complete', section: result.section, entries: validateModelEntries(result) };
};

const laneBounds = (changelog, laneHeading) => {
  const unreleased = changelog.indexOf('## [Unreleased]');
  if (unreleased < 0) throw new Error('CHANGELOG.md has no Unreleased section.');
  const releaseBodyStart = unreleased + '## [Unreleased]'.length;
  const releaseBody = changelog.slice(releaseBodyStart);
  const releaseLength = releaseBody.search(/\n## (?!#)/);
  const releaseEnd = releaseLength < 0 ? changelog.length : releaseBodyStart + releaseLength;
  const start = changelog.indexOf(laneHeading, releaseBodyStart);
  const duplicate = start < 0 ? -1 : changelog.indexOf(laneHeading, start + laneHeading.length);
  if (start < 0 || start >= releaseEnd || (duplicate >= 0 && duplicate < releaseEnd)) {
    throw new Error(`Expected exactly one ${laneHeading} lane in Unreleased.`);
  }
  const bodyStart = start + laneHeading.length;
  const rest = changelog.slice(bodyStart, releaseEnd);
  const next = rest.search(/\n### (?!#)/);
  return { start, bodyStart, end: next < 0 ? releaseEnd : bodyStart + next };
};

/** Insert validated bullets beneath a bounded heading, creating the subsection when needed. */
export const addOpenCodeChangelogEntries = ({ changelog, laneHeading, section, entries }) => {
  if (!SECTIONS.has(section)) throw new Error('Unsupported changelog section.');
  const lane = laneBounds(changelog, laneHeading);
  const laneText = changelog.slice(lane.bodyStart, lane.end);
  const existing = new Set(laneText.split('\n').map((line) => line.trim()));
  const additions = entries.filter((entry) => !existing.has(entry));
  if (!additions.length) throw new Error('Generated changelog entries duplicate existing entries in this release lane.');

  const sectionHeading = `#### ${section}`;
  const sectionAt = laneText.indexOf(sectionHeading);
  if (sectionAt < 0) {
    const afterLaneHeading = changelog.slice(0, lane.bodyStart).replace(/\s*$/, '');
    const rest = changelog.slice(lane.bodyStart).replace(/^\s*/, '');
    return `${afterLaneHeading}\n\n${sectionHeading}\n\n${additions.join('\n')}\n\n${rest}`;
  }
  if (laneText.indexOf(sectionHeading, sectionAt + sectionHeading.length) >= 0) throw new Error(`Expected at most one ${sectionHeading} subsection.`);

  const contentStart = sectionAt + sectionHeading.length;
  const absoluteContentStart = lane.bodyStart + contentStart;
  const prefix = changelog.slice(0, absoluteContentStart).replace(/\s*$/, '');
  const suffix = changelog.slice(absoluteContentStart).replace(/^\s*/, '');
  return `${prefix}\n\n${additions.join('\n')}${suffix ? `\n${suffix}` : ''}`;
};
