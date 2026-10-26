import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/opencode-first-look.yml');

test('the automatic OpenCode first-look review workflow stays removed', () => {
  assert.equal(existsSync(workflowPath), false);
});
