/**
 * Feature flag lifecycle script (`pnpm flags`). The registry is server/flags.json, read by the
 * client and the server. Commands:
 *   pnpm flags                  list every flag (kind, owner, per-target values, removeBy, references, overrides)
 *   pnpm flags check            validate the registry; fails when a dev flag is past its removeBy (CI)
 *   pnpm flags add <name>       scaffold a dev flag, off everywhere except local
 *   pnpm flags keep <name>      promote a dev flag to a permanent kill switch (needs --runbook and --owner)
 *   pnpm flags retire <name>    remove a flag and list the code that still names it
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FLAG_NAME, addFlag, isPastRemoveBy, isStableLineRef, isValidRemoveBy, keepFlag, parseVersion, retireFlag, serialize, validate } from './lib/flags-registry.mjs';
import { findReferences, findUnknownReferences } from './lib/flags-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const registryPath = () => process.env.FLAGS_FILE ?? path.join(ROOT, 'server', 'flags.json');
const loadRegistry = () => JSON.parse(readFileSync(registryPath(), 'utf8'));
const saveRegistry = (registry) => writeFileSync(registryPath(), serialize(registry));
/** The branch CI is checking: the PR base, else the pushed branch. Stable lines do not enforce removeBy. */
const checkedBranch = () => process.env.GITHUB_BASE_REF || process.env.GITHUB_REF_NAME || '';

const packageVersion = () => JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const parseArgs = (argv) => {
  const options = {};
  const positional = [];
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      index += 1;
      continue;
    }
    const next = argv[index + 1];
    const hasValue = next !== undefined && !next.startsWith('--');
    options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = hasValue ? next : true;
    index += hasValue ? 2 : 1;
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

/** Uses the option when given, asks on a terminal, and otherwise returns empty so the edit rejects it. */
const valueOrPrompt = async (value, question) => {
  if (typeof value === 'string') return value;
  return process.stdin.isTTY ? ask(question) : '';
};

const targetValues = (registry, entry) => registry.targets.map((target) => `${target[0].toUpperCase()}=${entry.values?.[target] ?? entry.default}`).join(' ');

const removeByLabel = (entry, version) => {
  if (entry.kind !== 'dev') return 'permanent';
  return isPastRemoveBy(entry.removeBy, version) ? `${entry.removeBy} PAST DUE` : entry.removeBy;
};

const overrideLabel = (entry, disabled) => (entry.capability && disabled.has(entry.capability) ? 'DISABLED by EMERGENCY_DISABLED_CAPABILITIES' : '-');

const listRow = (registry, [name, entry], version, disabled) => [
  name,
  entry.kind,
  entry.owner,
  targetValues(registry, entry),
  removeByLabel(entry, version),
  String(findReferences(name, ROOT).length),
  overrideLabel(entry, disabled),
];

const printList = (registry) => {
  const disabled = new Set((process.env.EMERGENCY_DISABLED_CAPABILITIES ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  const version = packageVersion();
  const rows = Object.entries(registry.flags).map((pair) => listRow(registry, pair, version, disabled));
  const header = ['flag', 'kind', 'owner', 'values (L/B/S/P)', 'removeBy', 'refs', 'override'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  for (const row of [header, ...rows]) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd());
};

const dueProblem = ([name, entry], version) =>
  entry.kind === 'dev' && !isStableLineRef(checkedBranch()) && isValidRemoveBy(entry.removeBy) && isPastRemoveBy(entry.removeBy, version)
    ? [`${name}: past its removeBy ${entry.removeBy} (package is ${version}). Retire it with \`pnpm flags retire ${name}\` or promote it with \`pnpm flags keep ${name}\`.`]
    : [];

const checkProblems = (registry) => [
  ...validate(registry),
  ...Object.entries(registry.flags).flatMap((pair) => dueProblem(pair, packageVersion())),
  ...findUnknownReferences(registry, ROOT).map((hit) => `${hit} names a flag that is not in server/flags.json`),
];

const runCheck = (registry) => {
  const problems = checkProblems(registry);
  if (problems.length > 0) {
    console.error(problems.map((problem) => `::error::${problem}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`${Object.keys(registry.flags).length} flags valid; none past removeBy.`);
};

const defaultRemoveBy = () => {
  const [major, minor] = parseVersion(packageVersion());
  return `${major}.${minor + 1}.0`;
};

const COMMANDS = {
  list: ({ registry }) => printList(registry),
  check: ({ registry }) => runCheck(registry),
  add: ({ registry, name, options }) => {
    const removeBy = typeof options.removeBy === 'string' ? options.removeBy : defaultRemoveBy();
    const owner = typeof options.owner === 'string' ? options.owner : 'WxboySuper';
    saveRegistry(addFlag(registry, name, { owner, removeBy, issue: options.issue }));
    console.log(`Added dev flag ${name} (off except local, removeBy ${removeBy}). Guard the code with flag('${name}').`);
  },
  keep: async ({ registry, name, options }) => {
    const owner = await valueOrPrompt(options.owner, 'Owner: ');
    const runbook = await valueOrPrompt(options.runbook, 'Runbook (what to do when this switch is thrown): ');
    saveRegistry(keepFlag(registry, name, { owner, runbook, force: options.force === true }));
    console.log(`${name} is now a permanent switch (default on).`);
  },
  retire: ({ registry, name }) => {
    saveRegistry(retireFlag(registry, name));
    const hits = findReferences(name, ROOT);
    console.log(`Retired ${name}.`);
    if (hits.length > 0) console.log(`Code still naming it (the compiler will list the typed ones):\n${hits.map((hit) => `  ${hit}`).join('\n')}`);
  },
};

const NEEDS_NAME = new Set(['add', 'keep', 'retire']);

const requireName = (command, name) => {
  if (!name) throw new Error(`Usage: pnpm flags ${command} <name>`);
  if (!FLAG_NAME.test(name)) throw new Error(`${name} is not a valid flag name (camelCase).`);
};

const main = async () => {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command = 'list', name] = positional;
  const handler = COMMANDS[command];
  if (!handler) throw new Error(`Unknown command ${command}. Use list, check, add, keep, or retire.`);
  if (NEEDS_NAME.has(command)) requireName(command, name);
  await handler({ registry: loadRegistry(), name, options });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
