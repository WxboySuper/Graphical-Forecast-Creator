/**
 * Flag registry rules: versions, the checked-in file format, validation, and the add, keep, and
 * retire edits. Pure functions over the parsed server/flags.json; file access lives in scripts/flags.mjs.
 */

export const FLAG_NAME = /^[a-z][A-Za-z0-9]*$/;
export const VERSION = /^\d+\.\d+\.\d+$/;
const KINDS = ['dev', 'switch'];
const VALUE_TYPES = ['boolean', 'string'];

/** Returns [major, minor, patch, isPrerelease] for a version such as 2.0.0-beta.22. */
export const parseVersion = (version) => {
  const [core, pre] = String(version).split('-');
  const [major, minor, patch] = core.split('.').map(Number);
  return [major, minor, patch, pre !== undefined];
};

/** Orders versions semver-style, with a prerelease below its release (2.1.0-beta.3 < 2.1.0). */
export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const firstDifference = [0, 1, 2].find((index) => a[index] !== b[index]);
  if (firstDifference !== undefined) return a[firstDifference] - b[firstDifference];
  return Number(a[3] === false) - Number(b[3] === false);
};

/** A dev flag is past its removeBy once the package version reaches that release. */
export const isPastRemoveBy = (removeBy, packageVersion) => compareVersions(packageVersion, removeBy) >= 0;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const formatObject = (value) => {
  const entries = Object.entries(value).map(([key, inner]) => `${JSON.stringify(key)}: ${formatValue(inner)}`);
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}';
};

const formatValue = (value) => (isPlainObject(value) ? formatObject(value) : JSON.stringify(value));

/** Writes the registry the way it is checked in: one flag per line. */
export const serialize = (registry) => {
  const flags = Object.entries(registry.flags).map(([name, entry]) => `    ${JSON.stringify(name)}: ${formatValue(entry)}`);
  const targets = JSON.stringify(registry.targets).replace(/,/g, ', ');
  return `{\n  "targets": ${targets},\n  "flags": {\n${flags.join(',\n')}\n  }\n}\n`;
};

const when = (condition, message) => (condition ? [message] : []);

const commonProblems = (name, entry) => [
  ...when(!FLAG_NAME.test(name), 'name must be camelCase'),
  ...when(!KINDS.includes(entry.kind), 'kind must be "dev" or "switch"'),
  ...when(!entry.owner?.trim(), 'owner is required'),
  ...when(!VALUE_TYPES.includes(typeof entry.default), 'default must be a boolean or a string'),
];

const valueProblems = (entry, targets, [target, value]) => {
  if (!targets.includes(target)) return [`unknown target "${target}"`];
  return when(typeof value !== typeof entry.default, `value for ${target} must match the type of default`);
};

const devProblems = (entry) => [
  ...when(entry.default !== false, 'a dev flag must default to off (fail closed)'),
  ...when(!VERSION.test(entry.removeBy ?? ''), 'a dev flag needs removeBy as a version like 2.1.0'),
  ...when(Boolean(entry.runbook || entry.capability), 'a dev flag cannot have a runbook or capability; run `pnpm flags keep` to make it a switch'),
];

const switchProblems = (entry) => [
  ...when(!entry.runbook?.trim(), 'a switch needs a runbook line'),
  ...when(Boolean(entry.removeBy), 'a switch is permanent and must not have removeBy'),
  ...when(entry.default !== true && typeof entry.default !== 'string', 'a switch defaults to on (or a fallback variant)'),
];

const kindProblems = (entry) => {
  if (entry.kind === 'dev') return devProblems(entry);
  return entry.kind === 'switch' ? switchProblems(entry) : [];
};

const entryProblems = (registry, [name, entry]) => [
  ...commonProblems(name, entry),
  ...Object.entries(entry.values ?? {}).flatMap((pair) => valueProblems(entry, registry.targets, pair)),
  ...kindProblems(entry),
].map((message) => `${name}: ${message}`);

/** Returns a list of problems with the registry; an empty list means it is valid. */
export const validate = (registry) => Object.entries(registry.flags).flatMap((pair) => entryProblems(registry, pair));

const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

const assertValid = (registry) => {
  const problems = validate(registry);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return registry;
};

const withFlag = (registry, name, entry) => ({ ...registry, flags: { ...registry.flags, [name]: entry } });

/** Adds a dev flag that is off everywhere except local. */
export const addFlag = (registry, name, { owner, removeBy, issue }) => {
  if (registry.flags[name]) throw new Error(`Flag ${name} already exists.`);
  const entry = { kind: 'dev', owner, ...(issue ? { issue: Number(issue) } : {}), removeBy, default: false, values: { local: true } };
  return assertValid(withFlag(registry, name, entry));
};

const assertKeepable = (registry, name, { owner, runbook, force }) => {
  const entry = registry.flags[name];
  if (!entry) throw new Error(`No flag named ${name}.`);
  if (entry.kind !== 'dev') throw new Error(`${name} is already a switch.`);
  if (!owner?.trim() || !runbook?.trim()) throw new Error('keep needs --owner and --runbook (what to do when this switch is thrown).');
  const offTargets = registry.targets.filter((target) => (entry.values?.[target] ?? entry.default) !== true);
  if (offTargets.length > 0 && !force) {
    throw new Error(`${name} is still off on ${offTargets.join(', ')}. Turn it on there first, or pass --force to make it default on everywhere.`);
  }
};

/** Promotes a dev flag to a permanent kill switch, refusing while it is still off somewhere it should be on. */
export const keepFlag = (registry, name, { owner, runbook, force = false }) => {
  assertKeepable(registry, name, { owner, runbook, force });
  const promoted = { ...omit(registry.flags[name], ['removeBy', 'values']), kind: 'switch', owner, default: true, runbook };
  return assertValid(withFlag(registry, name, promoted));
};

/** Removes a flag; the caller prints the code that still names it. */
export const retireFlag = (registry, name) => {
  if (!registry.flags[name]) throw new Error(`No flag named ${name}.`);
  return { ...registry, flags: omit(registry.flags, [name]) };
};
