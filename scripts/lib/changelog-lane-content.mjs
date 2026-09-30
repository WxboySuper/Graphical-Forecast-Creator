import { findChangelogLaneBounds } from './changelog-lanes.mjs';

/** @param {string} text */
export const stripMarkdownComments = (text) =>
  text.replace(/<!--[\s\S]*?-->/g, '').trim();

/** @param {string} laneBody */
export const laneHasReleaseContent = (laneBody) => {
  const withoutComments = stripMarkdownComments(laneBody);
  if (!withoutComments) return false;
  if (/No unreleased next-major changes/i.test(withoutComments)) return false;

  const lines = withoutComments.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^[-*]\s+\S/.test(line)) return true;
    if (line.length > 0 && !line.startsWith('#')) return true;
  }
  return false;
};

/** @param {string} changelog @param {'next-major' | 'stable-hotfix'} lane */
export const validateChangelogLaneForRelease = (changelog, lane) => {
  const bounds = findChangelogLaneBounds(changelog, lane);
  if (!bounds) {
    throw new Error(`CHANGELOG.md is missing the ${lane} lane heading.`);
  }
  const body = changelog.slice(bounds.start + bounds.heading.length, bounds.end);
  if (!laneHasReleaseContent(body)) {
    throw new Error(`The ${lane} changelog lane has no release notes (comments and empty headings are ignored).`);
  }
};
