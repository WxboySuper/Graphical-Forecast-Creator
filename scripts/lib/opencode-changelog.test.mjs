import test from 'node:test';
import assert from 'node:assert/strict';
import { addOpenCodeChangelogEntries, parseOpenCodeChangelogResult } from './opencode-changelog.mjs';

const entry = '- **Forecast export:** Preserve the selected outlook when exporting the current forecast.';
const laneHeading = '### Next major / beta';
const changelog = `# Changelog\n\n## [Unreleased]\n\n${laneHeading}\n\n#### Fixed\n\n- **Existing fix:** Keep the previous behavior stable.\n\n#### Dependencies\n\n- **react:** 1 → 2\n\n## v1.7.0\n`;

test('parses valid bounded output', () => {
  assert.deepEqual(parseOpenCodeChangelogResult(JSON.stringify({ status: 'complete', section: 'Added', entries: [entry] })), {
    status: 'complete', section: 'Added', entries: [entry],
  });
});

test('allows dependency sections and ordinary parentheses while rejecting markdown links', () => {
  const dependency = '- **@sentry/node:** Keep server tracing pinned to the supported integration (server runtime).';
  assert.deepEqual(parseOpenCodeChangelogResult(JSON.stringify({ status: 'complete', section: 'Dependencies', entries: [dependency] })), {
    status: 'complete', section: 'Dependencies', entries: [dependency],
  });
  assert.throws(() => parseOpenCodeChangelogResult(JSON.stringify({ status: 'complete', section: 'Added', entries: ['- **Forecast export:** Preserve the selection [details](more information).'] })), /format or size/);
});

test('rejects malformed, inconclusive, oversized, and duplicate output safely', () => {
  assert.throws(() => parseOpenCodeChangelogResult('not json'), /must be JSON/);
  assert.deepEqual(parseOpenCodeChangelogResult('{"status":"inconclusive"}'), { status: 'inconclusive' });
  assert.throws(() => parseOpenCodeChangelogResult(JSON.stringify({ status: 'complete', section: 'Added', entries: [entry, entry] })), /duplicate/);
  assert.throws(() => parseOpenCodeChangelogResult(JSON.stringify({ status: 'complete', section: 'Added', entries: ['# Inject a heading\n' + entry] })), /format or size/);
  assert.throws(() => parseOpenCodeChangelogResult('x'.repeat(16_001)), /too large/);
  assert.throws(() => parseOpenCodeChangelogResult(JSON.stringify({ status: 'complete', section: 'Added', entries: ['- **Forecast export:** Preserve the selection [details](https://example.test).'] })), /format or size/);
});

test('inserts a generated entry into an existing subsection without touching other sections', () => {
  const result = addOpenCodeChangelogEntries({ changelog, laneHeading, section: 'Fixed', entries: [entry] });
  assert.ok(result.indexOf(entry) < result.indexOf('- **Existing fix:**'));
  assert.match(result, /#### Fixed\n\n- \*\*Forecast export/);
  assert.ok(result.indexOf(entry) < result.indexOf('#### Dependencies'));
  assert.match(result, /## v1\.7\.0/);
});

test('creates a missing subsection in the selected release lane', () => {
  const result = addOpenCodeChangelogEntries({ changelog, laneHeading, section: 'Added', entries: [entry] });
  assert.match(result, /### Next major \/ beta\n\n#### Added\n\n- \*\*Forecast export/);
  assert.match(result, /#### Fixed/);
});

test('refuses duplicate entries and ambiguous Unreleased lanes, but ignores historical copies', () => {
  assert.throws(() => addOpenCodeChangelogEntries({ changelog, laneHeading, section: 'Fixed', entries: ['- **Existing fix:** Keep the previous behavior stable.'] }), /duplicate/);
  assert.throws(() => addOpenCodeChangelogEntries({ changelog, laneHeading: '### Missing', section: 'Added', entries: [entry] }), /Unreleased/);
  const ambiguous = changelog.replace('\n#### Fixed', `\n${laneHeading}\n\n#### Fixed`);
  assert.throws(() => addOpenCodeChangelogEntries({ changelog: ambiguous, laneHeading, section: 'Added', entries: [entry] }), /Unreleased/);
  const historical = `${changelog}\n${laneHeading}\n\n#### Fixed\n\n- **Historical fix:** Keep old releases unchanged.`;
  const result = addOpenCodeChangelogEntries({ changelog: historical, laneHeading, section: 'Added', entries: [entry] });
  assert.ok(result.indexOf(entry) < result.indexOf('## v1.7.0'));
  assert.ok(result.indexOf('- **Historical fix:**') > result.indexOf('## v1.7.0'));
});
