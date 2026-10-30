import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditAdvisories,
  fixableHighAdvisories,
  parseAuditReport,
} from './dependency-audit-report.mjs';

const report = {
  advisories: {
    1: { module_name: 'a', severity: 'high', title: 'fixable high', fixAvailable: true },
    2: { module_name: 'b', severity: 'critical', title: 'fixable critical', fixAvailable: { name: 'b', version: '2.0.0' } },
    3: { module_name: 'c', severity: 'high', title: 'unfixable high', fixAvailable: false },
    4: { module_name: 'd', severity: 'low', title: 'low', fixAvailable: true },
  },
};

test('parses a JSON report from stdout', () => {
  assert.deepEqual(parseAuditReport(JSON.stringify({ advisories: {} })), { advisories: {} });
});

test('returns null for empty, malformed, or non-object stdout', () => {
  assert.equal(parseAuditReport(''), null);
  assert.equal(parseAuditReport('   '), null);
  assert.equal(parseAuditReport('WARN something on stderr\n{"advisories":{}}'), null);
  assert.equal(parseAuditReport('[]'), null);
  assert.equal(parseAuditReport(undefined), null);
});

test('selects only fixable high and critical advisories', () => {
  assert.deepEqual(
    fixableHighAdvisories(report).map((advisory) => advisory.module_name),
    ['a', 'b'],
  );
});

test('reports every advisory for logging', () => {
  assert.equal(auditAdvisories(report).length, 4);
  assert.deepEqual(auditAdvisories(undefined), []);
});
