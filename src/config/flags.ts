/**
 * Feature flags: the one client read of `server/flags.json`, the registry the server also reads.
 * A flag is a named value per build target; anything not written for a target falls back to the
 * flag's `default`, so production is only ever on when the registry says so explicitly.
 * Run `pnpm flags` for the full list and the lifecycle commands.
 */
import registry from '../../server/flags.json';
import { type BuildTarget, getBuildTarget } from './buildTarget';

type Registry = typeof registry.flags;

/** Every flag name in the registry; an unknown name is a compile error. */
export type FlagName = keyof Registry;

/** Boolean for on/off flags, string for variants, taken from the entry's `default`. */
export type FlagValue<N extends FlagName> = Registry[N]['default'];

type FlagEntry = {
  default: boolean | string;
  values?: Partial<Record<BuildTarget, boolean | string>>;
  capability?: string;
};

const FLAGS = registry.flags as unknown as Record<FlagName, FlagEntry | undefined>;

/** Returns the flag's value for a target, or its default; a missing entry reads as off. */
export const flag = <N extends FlagName>(name: N, target: BuildTarget = getBuildTarget()): FlagValue<N> => {
  const entry = FLAGS[name];
  return (entry?.values?.[target] ?? entry?.default ?? false) as FlagValue<N>;
};

/** Returns the server capability key a flag is backed by, if it has one. */
export const flagCapability = (name: FlagName): string | null => FLAGS[name]?.capability ?? null;
