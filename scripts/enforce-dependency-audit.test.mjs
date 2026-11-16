import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import test from 'node:test';

const gate = resolve(import.meta.dirname, 'enforce-dependency-audit.mjs');

/** Runs the real gate with a fake pnpm that emits controlled audit output. */
const runGate = (stdout, stderr = '') => {
  const dir = mkdtempSync(join(tmpdir(), 'gfc-audit-'));
  try {
    const fixture = join(dir, 'audit-fixture.cjs');
    writeFileSync(fixture, 'process.stdout.write(process.env.AUDIT_STDOUT); process.stderr.write(process.env.AUDIT_STDERR);');
    if (process.platform === 'win32') {
      writeFileSync(join(dir, 'pnpm.cmd'), `@"${process.execPath}" "${fixture}"\r\n`);
    } else {
      const executable = join(dir, 'pnpm');
      writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${fixture}"\n`);
      chmodSync(executable, 0o755);
    }
    return spawnSync(process.execPath, [gate], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, AUDIT_STDOUT: stdout, AUDIT_STDERR: stderr },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('passes a clean report even when pnpm writes a warning to stderr', () => {
  const result = runGate(JSON.stringify({ advisories: {} }), 'registry warning');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dependency audit OK/);
});

test('fails on a fixable high advisory even when stderr contains a warning', () => {
  const result = runGate(JSON.stringify({ advisories: {
    1: { severity: 'high', fixAvailable: true, module_name: 'example', title: 'vulnerability' },
  } }), 'registry warning');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /example: vulnerability/);
});

test('fails when audit output is malformed, incomplete, or an error report', () => {
  for (const stdout of ['not json', '{}', JSON.stringify({ error: { summary: 'registry unavailable' } })]) {
    const result = runGate(stdout, 'registry warning');
    assert.equal(result.status, 1, `unexpected success for ${stdout}`);
    assert.match(result.stderr, /Dependency audit/);
  }
});
