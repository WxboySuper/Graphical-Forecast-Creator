import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertChangelogAuditHead,
  parseOpenCodeChangelogAuditResult,
  resolveManualChangelogAuditBaseline,
  validateChangelogAuditTarget,
} from './opencode-changelog-audit.mjs';

const entry = '- **Forecast export:** Preserve the selected outlook when exporting the current forecast.';

test('accepts a grounded no-change result and inconclusive result', () => {
  assert.deepEqual(parseOpenCodeChangelogAuditResult('{"status":"current"}'), { status: 'current' });
  assert.deepEqual(parseOpenCodeChangelogAuditResult('{"status":"inconclusive"}'), { status: 'inconclusive' });
});

test('publisher target validation excludes protected release branches and stale revisions', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(validateChangelogAuditTarget('main', sha), { targetRef: 'main', headSha: sha });
  assert.deepEqual(validateChangelogAuditTarget('stable/1.6.x', sha), { targetRef: 'stable/1.6.x', headSha: sha });
  for (const target of ['beta', 'stable/1.6.0', 'refs/heads/main', 'feature/test']) {
    assert.throws(() => validateChangelogAuditTarget(target, sha), /target is invalid/);
  }
  assert.throws(() => validateChangelogAuditTarget('main', 'not-a-sha'), /target is invalid/);
  assert.doesNotThrow(() => assertChangelogAuditHead(sha, sha));
  assert.throws(() => assertChangelogAuditHead(sha, 'b'.repeat(40)), /refusing to publish stale content/);
});

test('manual audit baseline resolves only a full ancestor SHA or version tag', () => {
  const head = 'b'.repeat(40);
  const baseline = 'a'.repeat(40);
  const resolveCommit = (ref) => ref.startsWith('v') ? baseline : ref;
  const isAncestor = (candidate, target) => candidate === baseline && target === head;

  const common = { targetRef: 'main', headSha: head, resolveCommit, isAncestor };
  assert.equal(resolveManualChangelogAuditBaseline({ ...common, baselineRef: baseline }), baseline);
  assert.equal(resolveManualChangelogAuditBaseline({ ...common, baselineRef: 'v1.8.0-beta.5' }), baseline);
  assert.equal(resolveManualChangelogAuditBaseline({ ...common, baselineRef: '' }), null);
  assert.throws(() => resolveManualChangelogAuditBaseline({ ...common, baselineRef: 'main~1' }), /full commit SHA or a version tag for the selected release line/);
  assert.throws(() => resolveManualChangelogAuditBaseline({ ...common, baselineRef: 'v1.8.0' }), /selected release line/);
  assert.throws(() => resolveManualChangelogAuditBaseline({ ...common, baselineRef: 'v1.7.7' }), /selected release line/);
  assert.throws(() => resolveManualChangelogAuditBaseline({ ...common, baselineRef: 'v1.8.0-beta.5', targetRef: 'stable/1.8.x' }), /selected release line/);
  assert.equal(resolveManualChangelogAuditBaseline({
    ...common, baselineRef: 'v1.8.3', targetRef: 'stable/1.8.x',
  }), baseline);
  assert.throws(() => resolveManualChangelogAuditBaseline({ ...common, baselineRef: baseline, resolveCommit: () => null }), /did not resolve/);
  assert.throws(() => resolveManualChangelogAuditBaseline({ ...common, baselineRef: baseline, isAncestor: () => false }), /must be an ancestor/);
});

test('validates update output with the shared strict changelog entry rules', () => {
  assert.deepEqual(parseOpenCodeChangelogAuditResult(JSON.stringify({ status: 'update', section: 'Added', entries: [entry] })), {
    status: 'update', section: 'Added', entries: [entry],
  });
  assert.throws(() => parseOpenCodeChangelogAuditResult(JSON.stringify({ status: 'update', section: 'Added', entries: ['not a bullet'] })), /format or size/);
  assert.throws(() => parseOpenCodeChangelogAuditResult('{"status":"update","section":"Unknown","entries":[]}'), /section is invalid/);
  assert.throws(() => parseOpenCodeChangelogAuditResult('no json'), /must be JSON/);
});
