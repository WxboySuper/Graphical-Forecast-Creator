/**
 * Feature flag lifecycle script (`pnpm flags`). The registry is server/flags.json, read by the
 * client and the server. Commands:
 *   pnpm flags                  list every flag (kind, owner, per-target values, removeBy, references, overrides)
 *   pnpm flags check            validate the registry; fails when a dev flag is past its removeBy (CI)
 *   pnpm flags add <name>       scaffold a dev flag, off everywhere except local
 *   pnpm flags keep <name>      promote a dev flag to a permanent kill switch (needs --runbook and --owner)
 *   pnpm flags retire <name>    remove a flag and list the code that still names it
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['src', 'server'];
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set(['node_modules', 'build', 'dist', 'coverage', '.git']);
const NAME = /^[a-z][A-Za-z0-9]*$/;
const VERSION = /^\d+\.\d+\.\d+$/;

/** Returns [major, minor, patch, isPrerelease] for a version such as 2.0.0-beta.22. */
const parseVersion = (version) => {
  const [core, pre] = String(version).split('-');
  const [major, minor, patch] = core.split('.').map(Number);
  return [major, minor, patch, pre !== undefined];
};

/** Orders versions semver-style, with a prerelease below its release (2.1.0-beta.3 < 2.1.0). */
export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return Number(a[3] === false) - Number(b[3] === false);
};

/** A dev flag is past its removeBy once the package version reaches that release. */
export const isPastRemoveBy = (removeBy, packageVersion) => compareVersions(packageVersion, removeBy) >= 0;

const formatValue = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value).map(([key, inner]) => `${JSON.stringify(key)}: ${formatValue(inner)}`);
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
};

/** Writes the registry the way it is checked in: one flag per line. */
export const serialize = (registry) => {
  const flags = Object.entries(registry.flags).map(([name, entry]) => `    ${JSON.stringify(name)}: ${formatValue(entry)}`);
  return `{\n  "targets": ${JSON.stringify(registry.targets).replace(/,/g, ', ')},\n  "flags": {\n${flags.join(',\n')}\n  }\n}\n`;
};

/** Returns a list of problems with the registry; an empty list means it is valid. */
export const validate = (registry) => {
  const problems = [];
  const sameType = (value, entry) => typeof value === typeof entry.default;
  for (const [name, entry] of Object.entries(registry.flags)) {
    const fail = (message) => problems.push(`${name}: ${message}`);
    if (!NAME.test(name)) fail('name must be camelCase');
    if (!['dev', 'switch'].includes(entry.kind)) fail('kind must be "dev" or "switch"');
    if (!entry.owner?.trim()) fail('owner is required');
    if (!['boolean', 'string'].includes(typeof entry.default)) fail('default must be a boolean or a string');
    for (const [target, value] of Object.entries(entry.values ?? {})) {
      if (!registry.targets.includes(target)) fail(`unknown target "${target}"`);
      else if (!sameType(value, entry)) fail(`value for ${target} must match the type of default`);
    }
    if (entry.kind === 'dev') {
      if (entry.default !== false) fail('a dev flag must default to off (fail closed)');
      if (!VERSION.test(entry.removeBy ?? '')) fail('a dev flag needs removeBy as a version like 2.1.0');
      if (entry.runbook || entry.capability) fail('a dev flag cannot have a runbook or capability; run `pnpm flags keep` to make it a switch');
    }
    if (entry.kind === 'switch') {
      if (!entry.runbook?.trim()) fail('a switch needs a runbook line');
      if (entry.removeBy) fail('a switch is permanent and must not have removeBy');
      if (entry.default !== true && typeof entry.default !== 'string') fail('a switch defaults to on (or a fallback variant)');
    }
  }
  return problems;
};

const walk = (directory, files = []) => {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (SOURCE_FILE.test(entry)) files.push(full);
  }
  return files;
};

/** Finds code that names a flag as a quoted string, skipping tests and the registry itself. */
export const findReferences = (name, root = ROOT) => {
  const pattern = new RegExp(`(['"])${name}\\1`);
  const hits = [];
  for (const directory of SOURCE_DIRS) {
    const base = path.join(root, directory);
    if (!existsSync(base)) continue;
    for (const file of walk(base)) {
      if (/\.test\.[cm]?[jt]sx?$/.test(file) || file.includes(`${path.sep}testing${path.sep}`)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${path.relative(root, file).split(path.sep).join('/')}:${index + 1}`);
      });
    }
  }
  return hits;
};

/** Returns flag('name') calls in code that name a flag the registry does not have. */
export const findUnknownReferences = (registry, root = ROOT) => {
  const unknown = [];
  for (const directory of SOURCE_DIRS) {
    const base = path.join(root, directory);
    if (!existsSync(base)) continue;
    for (const file of walk(base)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        for (const match of line.matchAll(/\bflag\(\s*'([A-Za-z0-9]+)'/g)) {
          if (!registry.flags[match[1]]) unknown.push(`${path.relative(root, file).split(path.sep).join('/')}:${index + 1} flag('${match[1]}')`);
        }
      });
    }
  }
  return unknown;
};

const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

/** Adds a dev flag that is off everywhere except local. */
export const addFlag = (registry, name, { owner, removeBy, issue }) => {
  if (registry.flags[name]) throw new Error(`Flag ${name} already exists.`);
  const entry = { kind: 'dev', owner, ...(issue ? { issue: Number(issue) } : {}), removeBy, default: false, values: { local: true } };
  const next = { ...registry, flags: { ...registry.flags, [name]: entry } };
  const problems = validate(next);
  if (problems.length) throw new Error(problems.join('\n'));
  return next;
};

/** Promotes a dev flag to a permanent kill switch, refusing while it is still off somewhere it should be on. */
export const keepFlag = (registry, name, { owner, runbook, force = false }) => {
  const entry = registry.flags[name];
  if (!entry) throw new Error(`No flag named ${name}.`);
  if (entry.kind !== 'dev') throw new Error(`${name} is already a switch.`);
  if (!owner?.trim() || !runbook?.trim()) throw new Error('keep needs --owner and --runbook (what to do when this switch is thrown).');
  const offTargets = registry.targets.filter((target) => (entry.values?.[target] ?? entry.default) !== true);
  if (offTargets.length && !force) {
    throw new Error(`${name} is still off on ${offTargets.join(', ')}. Turn it on there first, or pass --force to make it default on everywhere.`);
  }
  const next = {
    ...registry,
    flags: { ...registry.flags, [name]: { ...omit(entry, ['removeBy', 'values']), kind: 'switch', owner, default: true, runbook } },
  };
  const problems = validate(next);
  if (problems.length) throw new Error(problems.join('\n'));
  return next;
};

/** Removes a flag; the caller prints the code that still names it. */
export const retireFlag = (registry, name) => {
  if (!registry.flags[name]) throw new Error(`No flag named ${name}.`);
  return { ...registry, flags: omit(registry.flags, [name]) };
};

const registryPath = () => process.env.FLAGS_FILE ?? path.join(ROOT, 'server', 'flags.json');
const loadRegistry = () => JSON.parse(readFileSync(registryPath(), 'utf8'));
const saveRegistry = (registry) => writeFileSync(registryPath(), serialize(registry));
const packageVersion = () => JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const parseArgs = (argv) => {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith('--')) {
      const key = argv[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const next = argv[index + 1];
      options[key] = next === undefined || next.startsWith('--') ? true : (index += 1, next);
    } else positional.push(argv[index]);
  }
  return { options, positional };
};

const ask = async (question) => {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
};

const printList = (registry) => {
  const disabled = new Set((process.env.EMERGENCY_DISABLED_CAPABILITIES ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  const version = packageVersion();
  const rows = Object.entries(registry.flags).map(([name, entry]) => {
    const targets = registry.targets.map((target) => `${target[0].toUpperCase()}=${entry.values?.[target] ?? entry.default}`).join(' ');
    const due = entry.kind === 'dev' && isPastRemoveBy(entry.removeBy, version) ? ' PAST DUE' : '';
    const override = entry.capability && disabled.has(entry.capability) ? 'DISABLED by EMERGENCY_DISABLED_CAPABILITIES' : '-';
    return [name, entry.kind, entry.owner, targets, entry.kind === 'dev' ? `${entry.removeBy}${due}` : 'permanent', String(findReferences(name).length), override];
  });
  const header = ['flag', 'kind', 'owner', 'values (L/B/S/P)', 'removeBy', 'refs', 'override'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  for (const row of [header, ...rows]) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd());
};

const runCheck = (registry) => {
  const problems = validate(registry);
  const version = packageVersion();
  for (const [name, entry] of Object.entries(registry.flags)) {
    if (entry.kind === 'dev' && VERSION.test(entry.removeBy ?? '') && isPastRemoveBy(entry.removeBy, version)) {
      problems.push(`${name}: past its removeBy ${entry.removeBy} (package is ${version}). Retire it with \`pnpm flags retire ${name}\` or promote it with \`pnpm flags keep ${name}\`.`);
    }
  }
  problems.push(...findUnknownReferences(registry).map((hit) => `${hit} names a flag that is not in server/flags.json`));
  if (problems.length) {
    console.error(problems.map((problem) => `::error::${problem}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`${Object.keys(registry.flags).length} flags valid; none past removeBy.`);
};

const main = async () => {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command = 'list', name] = positional;
  const registry = loadRegistry();
  if (command === 'list') return printList(registry);
  if (command === 'check') return runCheck(registry);
  if (!name) throw new Error(`Usage: pnpm flags ${command} <name>`);

  if (command === 'add') {
    const [major, minor] = parseVersion(packageVersion());
    const removeBy = typeof options.removeBy === 'string' ? options.removeBy : `${major}.${minor + 1}.0`;
    saveRegistry(addFlag(registry, name, { owner: typeof options.owner === 'string' ? options.owner : 'WxboySuper', removeBy, issue: options.issue }));
    return console.log(`Added dev flag ${name} (off except local, removeBy ${removeBy}). Guard the code with flag('${name}').`);
  }
  if (command === 'keep') {
    const owner = typeof options.owner === 'string' ? options.owner : process.stdin.isTTY ? await ask('Owner: ') : '';
    const runbook = typeof options.runbook === 'string' ? options.runbook : process.stdin.isTTY ? await ask('Runbook (what to do when this switch is thrown): ') : '';
    saveRegistry(keepFlag(registry, name, { owner, runbook, force: options.force === true }));
    return console.log(`${name} is now a permanent switch (default on).`);
  }
  if (command === 'retire') {
    saveRegistry(retireFlag(registry, name));
    const hits = findReferences(name);
    console.log(`Retired ${name}.`);
    if (hits.length) console.log(`Code still naming it (the compiler will list the typed ones):\n${hits.map((hit) => `  ${hit}`).join('\n')}`);
    return undefined;
  }
  throw new Error(`Unknown command ${command}. Use list, check, add, keep, or retire.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
