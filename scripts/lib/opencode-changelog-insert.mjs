const SECTIONS = new Set(['Added', 'Changed', 'Fixed', 'Security']);

const unreleasedBounds = (changelog) => {
  const unreleased = changelog.indexOf('## [Unreleased]');
  if (unreleased < 0) throw new Error('CHANGELOG.md has no Unreleased section.');
  const start = unreleased + '## [Unreleased]'.length;
  const releaseBody = changelog.slice(start);
  const releaseLength = releaseBody.search(/\n## (?!#)/);
  const end = releaseLength < 0 ? changelog.length : start + releaseLength;
  return { start, end };
};

const hasDuplicateLane = (changelog, laneHeading, start, end) => {
  const duplicate = changelog.indexOf(laneHeading, start + laneHeading.length);
  return duplicate >= 0 && duplicate < end;
};

const uniqueLaneStart = (changelog, laneHeading, bounds) => {
  const start = changelog.indexOf(laneHeading, bounds.start);
  if (start < 0 || start >= bounds.end) throw new Error(`Expected exactly one ${laneHeading} lane in Unreleased.`);
  if (hasDuplicateLane(changelog, laneHeading, start, bounds.end)) throw new Error(`Expected exactly one ${laneHeading} lane in Unreleased.`);
  return start;
};

const laneContentEnd = (changelog, bodyStart, releaseEnd) => {
  const rest = changelog.slice(bodyStart, releaseEnd);
  const next = rest.search(/\n### (?!#)/);
  return next < 0 ? releaseEnd : bodyStart + next;
};

const laneBounds = (changelog, laneHeading) => {
  const release = unreleasedBounds(changelog);
  const start = uniqueLaneStart(changelog, laneHeading, release);
  const bodyStart = start + laneHeading.length;
  return { start, bodyStart, end: laneContentEnd(changelog, bodyStart, release.end) };
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
