import { findChangelogLaneBounds } from './changelog-lanes.mjs';

const COMMENT_START = '<!--';
const COMMENT_END = '-->';

/** @param {string} text */
const removeNextMarkdownComment = (text) => {
  const start = text.indexOf(COMMENT_START);
  if (start === -1) return text;
  const end = text.indexOf(COMMENT_END, start + COMMENT_START.length);
  if (end === -1) {
    return `${text.slice(0, start)}${text.slice(start + COMMENT_START.length)}`;
  }
  return `${text.slice(0, start)}${text.slice(end + COMMENT_END.length)}`;
};

/** @param {string} text */
export const stripMarkdownComments = (text) => {
  let current = text;
  let next = removeNextMarkdownComment(current);
  while (next !== current) {
    current = next;
    next = removeNextMarkdownComment(current);
  }
  return current.trim();
};

/** @param {string} line */
const isHeadingLine = (line) => /^#{1,6}\s/.test(line);

/** @param {string} line */
const isBulletLine = (line) => /^[-*]\s+\S/.test(line);

/** @param {string} line */
const isSubstantiveLine = (line) => line.length > 0 && !line.startsWith('#');

/** @param {string} laneBody */
export const laneHasReleaseContent = (laneBody) => {
  const withoutComments = stripMarkdownComments(laneBody);
  if (!withoutComments) return false;
  if (/No unreleased next-major changes/i.test(withoutComments)) return false;

  const lines = withoutComments.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.some((line) => isBulletLine(line) || isSubstantiveLine(line) && !isHeadingLine(line));
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
