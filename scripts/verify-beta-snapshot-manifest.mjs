/**
 * Verifies the beta Firestore migration snapshot before a Clerk+D1 release applies D1 migrations.
 *
 * Usage:
 *   node scripts/verify-beta-snapshot-manifest.mjs manifest <manifest.json> <full-snapshot.jsonl> <email-hashes-out.txt>
 *     Requires EXPECTED_BETA_FIREBASE_PROJECT_ID. Validates the manifest, counts the full snapshot, and writes the
 *     per-user email hashes (one per line) for the per-user verification batch.
 *   node scripts/verify-beta-snapshot-manifest.mjs user <user-snapshot.json> <sha256-email-hash>
 *     Confirms a downloaded per-user snapshot belongs to the expected normalized-email hash.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const EMAIL_HASH_PATTERN = /^[a-f0-9]{64}$/;

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

const isCompleteExport = (manifest) => manifest.complete === true
  && manifest.skippedNoEmailCount === 0
  && manifest.malformedLegacyCycleCount === 0
  && Array.isArray(manifest.accountFailures)
  && manifest.accountFailures.length === 0;

const hasConsistentCounts = (manifest) => isPositiveInteger(manifest.fullSnapshotCount)
  && isPositiveInteger(manifest.userSnapshotCount);

const hasUniqueEmailHashes = (manifest) => {
  const hashes = manifest.userSnapshotEmailHashes;
  if (!Array.isArray(hashes) || hashes.length !== manifest.userSnapshotCount) return false;
  if (!hashes.every((hash) => typeof hash === 'string' && EMAIL_HASH_PATTERN.test(hash))) return false;
  return new Set(hashes).size === hashes.length;
};

/** Returns true when the manifest is complete, matches the beta project, and lists unique per-user hashes. */
export const isValidSnapshotManifest = (manifest, expectedProjectId) => {
  if (!expectedProjectId || !manifest || manifest.projectId !== expectedProjectId) return false;
  return [isCompleteExport, hasConsistentCounts, hasUniqueEmailHashes].every((check) => check(manifest));
};

/** Counts non-empty JSONL records, throwing on any line that is not valid JSON. */
export const countSnapshotRecords = async (snapshotPath) => {
  let lines = 0;
  const input = fs.createReadStream(snapshotPath);
  for await (const line of readline.createInterface({ input, crlfDelay: Infinity })) {
    if (line.trim()) {
      JSON.parse(line);
      lines += 1;
    }
  }
  return lines;
};

/** Returns true when a per-user snapshot has an identity and its normalized email hashes to the expected value. */
export const isValidUserSnapshot = (snapshot, expectedHash) => {
  if (!EMAIL_HASH_PATTERN.test(expectedHash || '')) return false;
  const email = typeof snapshot?.email === 'string' ? snapshot.email.trim().toLowerCase() : '';
  if (!email || !snapshot.uid || !snapshot.userProfile) return false;
  return crypto.createHash('sha256').update(email).digest('hex') === expectedHash;
};

const verifyManifest = async (manifestPath, snapshotPath, hashesOutPath) => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!isValidSnapshotManifest(manifest, process.env.EXPECTED_BETA_FIREBASE_PROJECT_ID)) {
    throw new Error('Firestore snapshot manifest is incomplete or has skipped users/data.');
  }
  fs.writeFileSync(hashesOutPath, `${manifest.userSnapshotEmailHashes.join('\n')}\n`, { mode: 0o600 });
  const lines = await countSnapshotRecords(snapshotPath);
  if (lines !== manifest.fullSnapshotCount) {
    throw new Error(`Full snapshot has ${lines} records; manifest expects ${manifest.fullSnapshotCount}.`);
  }
};

const verifyUser = (snapshotPath, expectedHash) => {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (!isValidUserSnapshot(snapshot, expectedHash)) {
    throw new Error(`Snapshot for email hash ${expectedHash} does not match its expected identity.`);
  }
};

const main = async (argv) => {
  const [mode, ...args] = argv;
  if (mode === 'manifest' && args.length === 3) return verifyManifest(...args);
  if (mode === 'user' && args.length === 2) return verifyUser(...args);
  throw new Error('Usage: verify-beta-snapshot-manifest.mjs manifest <manifest> <full-snapshot> <hashes-out> | user <file> <hash>');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
