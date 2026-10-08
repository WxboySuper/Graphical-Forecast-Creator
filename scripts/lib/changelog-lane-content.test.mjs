import test from 'node:test';
import assert from 'node:assert/strict';
import {
  laneHasReleaseContent,
  stripMarkdownComments,
  validateChangelogLaneForRelease,
} from './changelog-lane-content.mjs';

test('laneHasReleaseContent ignores comments and empty headings', () => {
  const body = `#### Added

<!-- TODO -->

#### Changed

`;
  assert.equal(laneHasReleaseContent(body), false);
});

test('stripMarkdownComments removes repeated and broken comment markers', () => {
  const repeated = '#### Added\n\n<!-- first --><!-- second -->\n\n- **X:** Y.\n';
  assert.match(stripMarkdownComments(repeated), /- \*\*X:\*\* Y\./);
  assert.doesNotMatch(stripMarkdownComments(repeated), /first|second/);
  const broken = '#### Added\n\n<!-- never closed\n\n- **Z:** W.\n';
  assert.match(stripMarkdownComments(broken), /- \*\*Z:\*\* W\./);
});

test('laneHasReleaseContent accepts a real bullet', () => {
  const body = '#### Added\n\n- **Maps:** Something users see.\n';
  assert.equal(laneHasReleaseContent(body), true);
});

test('validateChangelogLaneForRelease requires the next-major lane', () => {
  const changelog = '# Changelog\n\n## [Unreleased]\n\n### Next major / beta\n\n#### Added\n\n- **X:** Y.\n';
  assert.doesNotThrow(() => validateChangelogLaneForRelease(changelog, 'next-major'));
});
