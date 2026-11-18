export const CHANGELOG_LANE_HEADINGS = {
  'next-major': '### Next major / beta',
  'stable-hotfix': '### Stable v2.x hotfixes',
};

/** @param {string} lane @returns {string} */
export const changelogLaneHeading = (lane) =>
  CHANGELOG_LANE_HEADINGS[lane] ?? CHANGELOG_LANE_HEADINGS['next-major'];

/**
 * @param {string} changelog
 * @param {string} lane
 * @returns {{ heading: string; start: number; end: number } | null}
 */
export const findChangelogLaneBounds = (changelog, lane) => {
  const heading = changelogLaneHeading(lane);
  const start = changelog.indexOf(heading);
  if (start === -1) return null;

  const bodyStart = start + heading.length;
  const rest = changelog.slice(bodyStart);
  const nextSection = rest.search(/\n### (?!#)|\n## /);
  return {
    heading,
    start,
    end: nextSection === -1 ? changelog.length : bodyStart + nextSection,
  };
};

/** @param {string} changelog @param {'next-major' | 'stable-hotfix'} lane */
export const extractChangelogLane = (changelog, lane) => {
  const bounds = findChangelogLaneBounds(changelog, lane);
  if (!bounds) return null;
  const body = changelog.slice(bounds.start + bounds.heading.length, bounds.end).trim();
  return body ? `${bounds.heading}\n\n${body}`.trim() : null;
};

/** @param {string} changelog @param {string} version @param {'next-major' | 'stable-hotfix'} lane */
export const extractLaneReleaseNotes = (changelog, version, lane) => {
  const laneSection = extractChangelogLane(changelog, lane);
  if (!laneSection) return null;
  const heading = changelogLaneHeading(lane);
  const body = laneSection.slice(heading.length).trim();
  return body ? `## v${version}\n\n${body}`.trim() : null;
};

/** @param {string} changelog @param {string} version @param {'next-major' | 'stable-hotfix'} lane */
export const moveLaneToReleaseSection = (changelog, version, lane) => {
  const heading = changelogLaneHeading(lane);
  const bounds = findChangelogLaneBounds(changelog, lane);
  if (!bounds) throw new Error(`CHANGELOG.md must include ${heading}.`);

  const releaseHeading = `## v${version}`;
  if (new RegExp(`^${releaseHeading.replaceAll('.', '\\.')}\\s*$`, 'm').test(changelog)) {
    return { changelog, moved: false };
  }

  const body = changelog.slice(bounds.start + heading.length, bounds.end).trim();
  const bodyWithoutComments = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!bodyWithoutComments || !/^\s*(?:[-*]|\d+\.)\s+\S/m.test(bodyWithoutComments)) {
    throw new Error(`The stable changelog lane is empty; release ${version} requires release notes.`);
  }

  const releaseSection = `${releaseHeading}\n\n${body}\n\n`;
  const laneReset = `${heading}\n\n#### Added\n\n<!-- Add stable-line changes here. -->\n`;
  return {
    changelog: `${changelog.slice(0, bounds.start)}${releaseSection}${laneReset}${changelog.slice(bounds.end).replace(/^\s*/, '')}`,
    moved: true,
  };
};
