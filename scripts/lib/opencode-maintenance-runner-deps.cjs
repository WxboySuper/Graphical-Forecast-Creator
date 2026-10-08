const fs = require('node:fs');
const path = require('node:path');

const localImportPattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Collect every local module reachable from the maintenance runner entrypoint. */
const visitLocalImports = (file, scriptsRoot, visited = new Set()) => {
  const absolute = path.resolve(file);
  if (visited.has(absolute)) return visited;
  visited.add(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  for (const match of source.matchAll(localImportPattern)) {
    const dependency = path.resolve(path.dirname(absolute), match[1]);
    if (!dependency.startsWith(`${scriptsRoot}${path.sep}`)) continue;
    visitLocalImports(dependency, scriptsRoot, visited);
  }
  return visited;
};

/** Basenames under scripts/lib required when run-opencode-maintenance.mjs runs from RUNNER_TEMP. */
const maintenanceRunnerLibBasenames = (scriptsRoot = path.resolve(__dirname, '..')) => {
  const entry = path.join(scriptsRoot, 'run-opencode-maintenance.mjs');
  const libRoot = path.join(scriptsRoot, 'lib');
  return [...visitLocalImports(entry, scriptsRoot)]
    .filter((file) => file.startsWith(`${libRoot}${path.sep}`))
    .map((file) => path.basename(file))
    .sort();
};

if (require.main === module) {
  for (const name of maintenanceRunnerLibBasenames()) process.stdout.write(`${name}\n`);
}

module.exports = { maintenanceRunnerLibBasenames, visitLocalImports };
