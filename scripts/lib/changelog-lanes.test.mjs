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
import { addOpenCodeChangelogEntries } from './opencode-changelog-insert.mjs';

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
  const lane = result.changelog.slice(result.changelog.indexOf('### Stable v2.x hotfixes'), result.changelog.indexOf('## v2.1.0'));
  assert.doesNotMatch(lane, /- Fix/);
});

test('keeps the reset stable lane under Unreleased, above the new release section', () => {
  const changelog = '# Changelog\n\n## [Unreleased]\n\n### Next major / beta\n\n#### Added\n- Feature\n\n### Stable v2.x hotfixes\n\n#### Fixed\n- Fix\n\n## v2.0.0\n\n- Old\n';
  const result = moveLaneToReleaseSection(changelog, '2.1.0', 'stable-hotfix').changelog;
  const at = (text) => result.indexOf(text);
  assert.ok(at('## [Unreleased]') < at('### Stable v2.x hotfixes'));
  assert.ok(at('### Stable v2.x hotfixes') < at('## v2.1.0'));
  assert.ok(at('## v2.1.0') < at('- Fix') && at('- Fix') < at('## v2.0.0'));
  const next = addOpenCodeChangelogEntries({
    changelog: result,
    laneHeading: '### Stable v2.x hotfixes',
    section: 'Fixed',
    entries: ['- Next fix'],
  });
  assert.ok(next.indexOf('- Next fix') < next.indexOf('## v2.1.0'));
});

test('rejects an empty stable lane and avoids duplicating an existing release section', () => {
  const empty = sample.replace('#### Fixed\n- Fix', '#### Added\n\n<!-- Add stable-line changes here. -->');
  assert.throws(() => moveLaneToReleaseSection(empty, '2.1.0', 'stable-hotfix'), /lane is empty/);
  const existing = `# Changelog\n\n## v2.0.0\n\n- Already recorded\n\n${sample.slice(sample.indexOf('### Stable v2.x hotfixes'))}`;
  assert.deepEqual(moveLaneToReleaseSection(existing, '2.0.0', 'stable-hotfix'), { changelog: existing, moved: false });
});

test('a bullet inside an HTML comment, or after an unterminated one, does not count as release notes', () => {
  const commented = sample.replace('#### Fixed\n- Fix', '#### Added\n\n<!--\n- Fix hidden in a comment\n-->');
  assert.throws(() => moveLaneToReleaseSection(commented, '2.1.0', 'stable-hotfix'), /lane is empty/);
  const unterminated = sample.replace('#### Fixed\n- Fix', '#### Added\n\n<!-- never closed\n- Fix');
  assert.throws(() => moveLaneToReleaseSection(unterminated, '2.1.0', 'stable-hotfix'), /lane is empty/);
  const real = sample.replace('#### Fixed\n- Fix', '#### Added\n\n<!-- note -->\n- Real fix');
  assert.equal(moveLaneToReleaseSection(real, '2.1.0', 'stable-hotfix').moved, true);
});
