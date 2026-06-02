#!/usr/bin/env node
/**
 * Exits 1 if rolloutAt has not passed (unless --force).
 * Usage: node assert-rollout-ready.mjs --rollout-at ISO [--force]
 */
import { parseInstant } from '../lib/production-release.mjs';

/** @returns {{ rolloutAt: string, force: boolean }} */
function parseArgs() {
  let rolloutAt = '';
  let force = false;
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--force') {
      force = true;
    } else if (arg === '--rollout-at' && process.argv[i + 1]) {
      rolloutAt = process.argv[i + 1];
      i += 1;
    }
  }
  return { rolloutAt, force };
}

/** Exits when rolloutAt is still in the future (unless --force). */
function main() {
  const { rolloutAt, force } = parseArgs();
  if (force || !rolloutAt.trim()) {
    return;
  }
  const rolloutAtMs = parseInstant(rolloutAt);
  if (rolloutAtMs === null) {
    console.error('Invalid rolloutAt in manifest');
    process.exit(1);
  }
  if (Date.now() < rolloutAtMs) {
    console.error('rolloutAt has not passed yet:', rolloutAt);
    process.exit(1);
  }
}

main();
