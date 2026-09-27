import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { sensitiveEnvironmentPaths, sparseCheckoutPatterns } from './lib/opencode-audit-worker.cjs';

const trackedPaths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const excludedPaths = sensitiveEnvironmentPaths(trackedPaths);
const scope = process.env.OPENCODE_WORKSPACE_SCOPE || null;

if (!excludedPaths.length && !scope) {
  process.stdout.write('No tracked environment files need exclusion.\n');
  process.exit(0);
}

const patterns = sparseCheckoutPatterns({ scope, excludedPaths });
execFileSync('git', ['sparse-checkout', 'set', '--no-cone', ...patterns], { stdio: 'inherit' });

for (const file of excludedPaths) {
  if (existsSync(path.resolve(file))) throw new Error('A tracked environment file remains visible to OpenCode.');
}

process.stdout.write(`Excluded ${excludedPaths.length} tracked environment file(s) from the OpenCode worktree.\n`);
