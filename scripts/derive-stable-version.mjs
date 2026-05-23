import { deriveStableVersion } from './lib/package-version.mjs';

const raw = process.argv[2] ?? process.env.RAW_VERSION ?? '';
const requireStable = process.argv.includes('--require-stable');

if (!raw) {
  console.error('Usage: node scripts/derive-stable-version.mjs <version> [--require-stable]');
  process.exit(1);
}

const stable = deriveStableVersion(raw);
if (requireStable && !stable) {
  console.error(`Could not derive stable version from "${raw}".`);
  process.exit(1);
}

console.log(stable ?? raw);
