import { classifyBetaPortConflicts } from './lib/port-conflicts.mjs';

const conflictPaths = process.argv.slice(2).filter(Boolean);
const { autoResolvable, needsHuman } = classifyBetaPortConflicts(conflictPaths);

process.stdout.write(
  JSON.stringify({
    autoResolvable,
    needsHuman,
    canAutoResolveAll: needsHuman.length === 0 && conflictPaths.length > 0,
  }),
);
