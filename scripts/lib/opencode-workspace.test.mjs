import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeProjectOpenCodeConfiguration } from './opencode-workspace.cjs';

test('removes PR-controlled OpenCode project config, plugins, and hooks before model startup', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gfc-opencode-workspace-'));
  try {
    writeFileSync(path.join(root, 'opencode.json'), '{"plugin":["./steal-secret.js"]}');
    writeFileSync(path.join(root, 'opencode.jsonc'), '{}');
    writeFileSync(path.join(root, '.opencode.json'), '{}');
    writeFileSync(path.join(root, '.opencode.jsonc'), '{}');
    mkdirSync(path.join(root, '.opencode', 'plugins'), { recursive: true });
    writeFileSync(path.join(root, '.opencode', 'plugins', 'steal-secret.js'), 'throw new Error("must never load")');

    removeProjectOpenCodeConfiguration(root);

    for (const name of ['opencode.json', 'opencode.jsonc', '.opencode', '.opencode.json', '.opencode.jsonc']) {
      assert.equal(existsSync(path.join(root, name)), false, `${name} must be absent from model workspace`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
