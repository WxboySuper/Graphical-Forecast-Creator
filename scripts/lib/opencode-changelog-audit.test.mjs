import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenCodeChangelogAuditResult } from './opencode-changelog-audit.mjs';

const entry = '- **Forecast export:** Preserve the selected outlook when exporting the current forecast.';

test('accepts a grounded no-change result and inconclusive result', () => {
  assert.deepEqual(parseOpenCodeChangelogAuditResult('{"status":"current"}'), { status: 'current' });
  assert.deepEqual(parseOpenCodeChangelogAuditResult('{"status":"inconclusive"}'), { status: 'inconclusive' });
});

test('validates update output with the shared strict changelog entry rules', () => {
  assert.deepEqual(parseOpenCodeChangelogAuditResult(JSON.stringify({ status: 'update', section: 'Added', entries: [entry] })), {
    status: 'update', section: 'Added', entries: [entry],
  });
  assert.throws(() => parseOpenCodeChangelogAuditResult(JSON.stringify({ status: 'update', section: 'Added', entries: ['not a bullet'] })), /format or size/);
  assert.throws(() => parseOpenCodeChangelogAuditResult('{"status":"update","section":"Unknown","entries":[]}'), /section is invalid/);
  assert.throws(() => parseOpenCodeChangelogAuditResult('no json'), /must be JSON/);
});
