/**
 * Checks release-lane extraction, formatting, and shared heading boundaries.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHANGELOG_LANE_HEADINGS,
  extractChangelogLane,
  extractLaneReleaseNotes,
  findChangelogLaneBounds,
  moveLaneToReleaseSection,
} from './changelog-lanes.mjs';

const sample = '# Changelog\n\n### Next major / beta\n\n#### Added\n- Feature\n\n### Stable v2.x hotfixes\n\n#### Fixed\n- Fix\n';

test('extracts one lane without including its sibling', () => {
  const lane = extractChangelogLane(sample, 'next-major');
  assert.match(lane ?? '', /Feature/);
  assert.doesNotMatch(lane ?? '', /Fix/);
});

test('formats lane notes with the release version', () => {
  assert.match(extractLaneReleaseNotes(sample, '2.0.0', 'stable-hotfix') ?? '', /v2\.0\.0/);
});

test('shares lane headings and boundaries with lane consumers', () => {
  const bounds = findChangelogLaneBounds(sample, 'next-major');
  assert.equal(bounds?.heading, CHANGELOG_LANE_HEADINGS['next-major']);
  assert.match(sample.slice(bounds?.start ?? 0, bounds?.end), /Feature/);
  assert.doesNotMatch(sample.slice(bounds?.start ?? 0, bounds?.end), /Fix/);
});

test('moves stable lane content into a version section and resets the lane', () => {
  const result = moveLaneToReleaseSection(sample, '2.1.0', 'stable-hotfix');
  assert.equal(result.moved, true);
  assert.match(result.changelog, /## v2\.1\.0\n\n#### Fixed\n- Fix/);
  assert.match(result.changelog, /### Stable v2\.x hotfixes\n\n#### Added\n\n<!-- Add stable-line changes here\. -->/);
  assert.doesNotMatch(result.changelog.slice(result.changelog.indexOf('### Stable v2.x hotfixes')), /- Fix/);
});

test('rejects an empty stable lane and avoids duplicating an existing release section', () => {
  const empty = sample.replace('#### Fixed\n- Fix', '#### Added\n\n<!-- Add stable-line changes here. -->');
  assert.throws(() => moveLaneToReleaseSection(empty, '2.1.0', 'stable-hotfix'), /lane is empty/);
  const existing = `# Changelog\n\n## v2.0.0\n\n- Already recorded\n\n${sample.slice(sample.indexOf('### Stable v2.x hotfixes'))}`;
  assert.deepEqual(moveLaneToReleaseSection(existing, '2.0.0', 'stable-hotfix'), { changelog: existing, moved: false });
});
