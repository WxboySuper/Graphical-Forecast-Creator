import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addFlag, compareVersions, isPastRemoveBy, isStableLineRef, isValidRemoveBy, keepFlag, retireFlag, serialize, validate } from './lib/flags-registry.mjs';
import { findReferences } from './lib/flags-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The file format is LF; Windows checkouts may convert line endings.
const REGISTRY_TEXT = readFileSync(path.join(ROOT, 'server', 'flags.json'), 'utf8').replace(/\r\n/g, '\n');
const registry = () => JSON.parse(REGISTRY_TEXT);

const base = () => ({
  targets: ['local', 'beta', 'staging', 'production'],
  flags: {
    fresh: { kind: 'dev', owner: 'a', removeBy: '2.1.0', default: false, values: { local: true, beta: true } },
    live: { kind: 'dev', owner: 'a', removeBy: '2.1.0', default: false, values: { local: true, beta: true, staging: true, production: true } },
  },
});

describe('flags registry', () => {
  it('is valid and round-trips through the serializer byte for byte', () => {
    assert.deepEqual(validate(registry()), []);
    assert.equal(serialize(registry()), REGISTRY_TEXT);
  });

  it('rejects the shapes that would break fail-closed behavior', () => {
    const bad = base();
    bad.flags.fresh.default = true;
    bad.flags.live.removeBy = 'soon';
    bad.flags.sw = { kind: 'switch', owner: 'a', default: true };
    bad.flags.cap = { kind: 'dev', owner: 'a', removeBy: '2.1.0', default: false, capability: 'X' };
    bad.flags.fresh.values.nowhere = true;
    const problems = validate(bad).join('\n');
    assert.match(problems, /fresh: a dev flag must default to off/);
    assert.match(problems, /live: a dev flag needs removeBy/);
    assert.match(problems, /sw: a switch needs a runbook/);
    assert.match(problems, /cap: a dev flag cannot have a runbook or capability/);
    assert.match(problems, /fresh: unknown target "nowhere"/);
  });
});

describe('references', () => {
  it('matches names literally, so a pattern-like argument cannot match everything or throw', () => {
    assert.ok(findReferences('mesoscaleWorkspace', ROOT).length > 0);
    assert.deepEqual(findReferences('.*', ROOT), []);
    assert.deepEqual(findReferences('(', ROOT), []);
  });
});

describe('removeBy', () => {
  it('treats a prerelease as earlier than its release', () => {
    assert.ok(compareVersions('2.1.0-beta.3', '2.1.0') < 0);
    assert.equal(isPastRemoveBy('2.1.0', '2.0.0-beta.22'), false);
    assert.equal(isPastRemoveBy('2.1.0', '2.1.0-beta.1'), false);
    assert.equal(isPastRemoveBy('2.1.0', '2.1.0'), true);
    assert.equal(isPastRemoveBy('2.1.0', '2.2.0-beta.1'), true);
  });

  it('lets a line removeBy such as 2.x outlive every 2.y release and expire with the next major', () => {
    assert.equal(isPastRemoveBy('2.x', '2.0.0'), false);
    assert.equal(isPastRemoveBy('2.x', '2.7.0'), false);
    assert.equal(isPastRemoveBy('2.x', '3.0.0-beta.26'), false);
    assert.equal(isPastRemoveBy('2.x', '3.0.0'), true);
    assert.equal(isValidRemoveBy('2.x'), true);
    assert.equal(isValidRemoveBy('2.1.0'), true);
    assert.equal(isValidRemoveBy('soon'), false);
  });

  it('recognises stable lines, where expiry is not enforced', () => {
    assert.equal(isStableLineRef('stable/2.x'), true);
    assert.equal(isStableLineRef('stable/1.7.x'), true);
    assert.equal(isStableLineRef('main'), false);
    assert.equal(isStableLineRef('feat/stable/2.x'), false);
  });
});

describe('lifecycle commands', () => {
  it('adds a dev flag that is off everywhere except local', () => {
    const next = addFlag(base(), 'newThing', { owner: 'a', removeBy: '2.2.0' });
    assert.deepEqual(next.flags.newThing, { kind: 'dev', owner: 'a', removeBy: '2.2.0', default: false, values: { local: true } });
    assert.throws(() => addFlag(next, 'newThing', { owner: 'a', removeBy: '2.2.0' }), /already exists/);
  });

  it('keeps a flag as a switch only once it is on everywhere, and asks for an owner and runbook', () => {
    assert.throws(() => keepFlag(base(), 'fresh', { owner: 'a', runbook: 'r' }), /still off on staging, production/);
    assert.throws(() => keepFlag(base(), 'live', { owner: '', runbook: '' }), /--owner and --runbook/);
    const next = keepFlag(base(), 'live', { owner: 'a', runbook: 'Set it false and redeploy.' });
    assert.deepEqual(next.flags.live, { kind: 'switch', owner: 'a', default: true, runbook: 'Set it false and redeploy.' });
    assert.equal(keepFlag(base(), 'fresh', { owner: 'a', runbook: 'r', force: true }).flags.fresh.default, true);
  });

  it('retires a flag', () => {
    assert.deepEqual(Object.keys(retireFlag(base(), 'fresh').flags), ['live']);
    assert.throws(() => retireFlag(base(), 'missing'), /No flag named/);
  });
});
