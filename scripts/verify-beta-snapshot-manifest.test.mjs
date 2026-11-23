import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { countSnapshotRecords, isValidSnapshotManifest, isValidUserSnapshot } from './verify-beta-snapshot-manifest.mjs';

const script = fileURLToPath(new URL('./verify-beta-snapshot-manifest.mjs', import.meta.url));
const hashOf = (email) => crypto.createHash('sha256').update(email).digest('hex');
const hash = hashOf('tester@example.com');
const manifest = {
  projectId: 'beta-project',
  complete: true,
  skippedNoEmailCount: 0,
  malformedLegacyCycleCount: 0,
  accountFailures: [],
  fullSnapshotCount: 2,
  userSnapshotCount: 1,
  userSnapshotEmailHashes: [hash],
};
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'beta-snapshot-'));
const run = (args, env = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('accepts a complete manifest for the expected beta project', () => {
  assert.equal(isValidSnapshotManifest(manifest, 'beta-project'), true);
});

test('rejects manifests for another project, incomplete exports, or bad hash lists', () => {
  assert.equal(isValidSnapshotManifest(manifest, ''), false);
  assert.equal(isValidSnapshotManifest(manifest, 'production-project'), false);
  assert.equal(isValidSnapshotManifest({ ...manifest, complete: false }, 'beta-project'), false);
  assert.equal(isValidSnapshotManifest({ ...manifest, accountFailures: ['x'] }, 'beta-project'), false);
  assert.equal(isValidSnapshotManifest({ ...manifest, userSnapshotEmailHashes: ['not-a-hash'] }, 'beta-project'), false);
  assert.equal(isValidSnapshotManifest({ ...manifest, userSnapshotCount: 2, userSnapshotEmailHashes: [hash, hash] }, 'beta-project'), false);
});

test('matches a per-user snapshot to its normalized email hash', () => {
  const snapshot = { email: ' Tester@Example.com ', uid: 'u1', userProfile: {} };
  assert.equal(isValidUserSnapshot(snapshot, hash), true);
  assert.equal(isValidUserSnapshot(snapshot, hashOf('other@example.com')), false);
  assert.equal(isValidUserSnapshot({ ...snapshot, uid: '' }, hash), false);
  assert.equal(isValidUserSnapshot(snapshot, 'bad'), false);
});

test('counts JSONL records and rejects malformed lines', async () => {
  const dir = tempDir();
  const good = path.join(dir, 'good.jsonl');
  fs.writeFileSync(good, '{"a":1}\n\n{"b":2}\n');
  assert.equal(await countSnapshotRecords(good), 2);
  const bad = path.join(dir, 'bad.jsonl');
  fs.writeFileSync(bad, '{"a":1}\nnot json\n');
  await assert.rejects(countSnapshotRecords(bad));
});

test('CLI manifest mode writes hashes and fails on a count mismatch', () => {
  const dir = tempDir();
  const manifestPath = path.join(dir, 'manifest.json');
  const snapshotPath = path.join(dir, 'full.jsonl');
  const hashesPath = path.join(dir, 'hashes.txt');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(snapshotPath, '{"a":1}\n{"b":2}\n');
  const ok = run(['manifest', manifestPath, snapshotPath, hashesPath], { EXPECTED_BETA_FIREBASE_PROJECT_ID: 'beta-project' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(fs.readFileSync(hashesPath, 'utf8'), `${hash}\n`);
  fs.writeFileSync(snapshotPath, '{"a":1}\n');
  const mismatch = run(['manifest', manifestPath, snapshotPath, hashesPath], { EXPECTED_BETA_FIREBASE_PROJECT_ID: 'beta-project' });
  assert.equal(mismatch.status, 1);
  const wrongProject = run(['manifest', manifestPath, snapshotPath, hashesPath], { EXPECTED_BETA_FIREBASE_PROJECT_ID: 'other' });
  assert.equal(wrongProject.status, 1);
});

test('CLI user mode exits non-zero for a mismatched snapshot', () => {
  const dir = tempDir();
  const file = path.join(dir, `${hash}.json`);
  fs.writeFileSync(file, JSON.stringify({ email: 'tester@example.com', uid: 'u1', userProfile: {} }));
  assert.equal(run(['user', file, hash]).status, 0);
  assert.equal(run(['user', file, hashOf('other@example.com')]).status, 1);
  assert.equal(run(['user']).status, 1);
});
