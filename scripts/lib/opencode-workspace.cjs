const fs = require('node:fs');
const path = require('node:path');

const PROJECT_OPENCODE_CONFIGURATION = [
  'opencode.json',
  'opencode.jsonc',
  '.opencode',
  '.opencode.json',
  '.opencode.jsonc',
];

/** Remove PR-controlled OpenCode project configuration, plugins, and hooks before model startup. */
const removeProjectOpenCodeConfiguration = (workspaceRoot) => {
  for (const relativePath of PROJECT_OPENCODE_CONFIGURATION) {
    fs.rmSync(path.join(workspaceRoot, relativePath), { recursive: true, force: true });
  }
  return [...PROJECT_OPENCODE_CONFIGURATION];
};

module.exports = { PROJECT_OPENCODE_CONFIGURATION, removeProjectOpenCodeConfiguration };
