/**
 * Finds where code names a flag: the references `pnpm flags` counts and lists, and the flag('name')
 * calls `pnpm flags check` verifies against the registry. Skips build output and dependencies.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_DIRS = ['src', 'server'];
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(['node_modules', 'build', 'dist', 'coverage', '.git']);
const FLAG_CALL = /\bflag\(\s*'([A-Za-z0-9]+)'/g;

const childrenOf = (directory) =>
  readdirSync(directory)
    .filter((entry) => !SKIP_DIRS.has(entry))
    .map((entry) => path.join(directory, entry));

const walk = (directory) =>
  childrenOf(directory).flatMap((full) => {
    if (statSync(full).isDirectory()) return walk(full);
    return SOURCE_FILE.test(full) ? [full] : [];
  });

const sourceFiles = (root) =>
  SOURCE_DIRS.map((directory) => path.join(root, directory))
    .filter((base) => existsSync(base))
    .flatMap((base) => walk(base));

const isTestSupport = (file) => TEST_FILE.test(file) || file.includes(`${path.sep}testing${path.sep}`);

const location = (root, file, index) => `${path.relative(root, file).split(path.sep).join('/')}:${index + 1}`;

const linesOf = (file) => readFileSync(file, 'utf8').split('\n');

/** Finds code that names a flag as a quoted string, skipping tests and test support. */
export const findReferences = (name, root) => {
  const quoted = [`'${name}'`, `"${name}"`];
  return sourceFiles(root)
    .filter((file) => !isTestSupport(file))
    .flatMap((file) =>
      linesOf(file).flatMap((line, index) => (quoted.some((text) => line.includes(text)) ? [location(root, file, index)] : []))
    );
};

const unknownCallsOn = (scan, line, index) =>
  [...line.matchAll(FLAG_CALL)]
    .filter((match) => !scan.registry.flags[match[1]])
    .map((match) => `${location(scan.root, scan.file, index)} flag('${match[1]}')`);

/** Returns flag('name') calls in code that name a flag the registry does not have. */
export const findUnknownReferences = (registry, root) =>
  sourceFiles(root).flatMap((file) => linesOf(file).flatMap((line, index) => unknownCallsOn({ registry, root, file }, line, index)));
