import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { isWorkPathAllowed } from './lib/opencode-audit-worker.cjs';

const scope = process.env.AUDIT_SCOPE;
const outputPath = process.env.OPENCODE_OUTPUT_PATH;
const githubOutput = process.env.GITHUB_OUTPUT;

if (!scope || !outputPath || !githubOutput) {
  throw new Error('Audit scope, model output path, and GITHUB_OUTPUT are required.');
}

const report = readFileSync(outputPath, 'utf8').trim();
const statusEntries = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
  encoding: 'utf8',
});
const changedPaths = statusEntries
  .split('\0')
  .filter(Boolean)
  .map((entry) => entry.slice(3));

function setOutputs(values) {
  appendFileSync(githubOutput, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
}

function markHuman(reason) {
  writeFileSync(outputPath, reason.slice(0, 3000), 'utf8');
  setOutputs({ needs_human: 'true', changed_paths: '[]', reason: reason.replace(/[\r\n]/g, ' ').slice(0, 1000) });
}

if (/^NEEDS_HUMAN\s*:/i.test(report)) {
  if (changedPaths.length) throw new Error('OpenCode changed files while requesting human review.');
  markHuman(report.replace(/^NEEDS_HUMAN\s*:\s*/i, '') || 'OpenCode stopped without a reason.');
  process.exit(0);
}

if (!report || !changedPaths.length) {
  markHuman('OpenCode made no scoped change that is ready for validation.');
  process.exit(0);
}

for (const file of changedPaths) {
  if (!isWorkPathAllowed(file, scope)) {
    throw new Error(`Changed path is outside the audit issue scope or is sensitive: ${file}`);
  }
}

const stage = spawnSync('git', ['add', '--', ...changedPaths], { encoding: 'utf8' });
if (stage.status !== 0) throw new Error('Could not stage the validated change for checking.');

const diffCheck = spawnSync('git', ['diff', '--cached', '--check'], { encoding: 'utf8' });
if (diffCheck.status !== 0) {
  process.stderr.write(diffCheck.stdout ?? '');
  process.stderr.write(diffCheck.stderr ?? '');
  throw new Error('The generated change has whitespace errors.');
}

const sourcePaths = changedPaths.filter((file) => /\.(?:[cm]?[jt]sx?)$/i.test(file));
const validations = ['scoped file and whitespace checks'];
const tests = sourcePaths.length
  ? spawnSync('pnpm', ['exec', 'jest', '--runInBand', '--passWithNoTests', '--findRelatedTests', ...sourcePaths], { stdio: 'inherit' })
  : { status: 0 };
if (tests.status !== 0) throw new Error('Related Jest tests failed.');
if (sourcePaths.length) validations.push('Jest related tests');

const lintable = sourcePaths.filter((file) => /\.(?:[cm]?[jt]sx?)$/i.test(file));
if (lintable.length) {
  const lint = spawnSync('pnpm', ['exec', 'eslint', ...lintable], { stdio: 'inherit' });
  if (lint.status !== 0) throw new Error('ESLint failed on changed source files.');
  validations.push('ESLint');
}

if (changedPaths.some((file) => /\.tsx?$/i.test(file))) {
  const typecheck = spawnSync('pnpm', ['typecheck'], { stdio: 'inherit' });
  if (typecheck.status !== 0) throw new Error('TypeScript checking failed.');
  validations.push('TypeScript check');
}

if (changedPaths.some((file) => file.startsWith('src/'))) {
  const build = spawnSync('pnpm', ['run', 'build'], { stdio: 'inherit' });
  if (build.status !== 0) throw new Error('The application build failed.');
  validations.push('application build');
}

setOutputs({
  needs_human: 'false',
  changed_paths: JSON.stringify(changedPaths),
  summary: report.replace(/[\r\n]/g, ' ').slice(0, 3000),
  validation_summary: validations.join(', '),
});
