import test from 'node:test';
import assert from 'node:assert/strict';
import { GITHUB_CREDENTIAL_VARIABLES, modelEnvironment } from './opencode-env.cjs';

test('OpenCode receives its model key but no GitHub or Actions credential variables', () => {
  const source = Object.fromEntries(GITHUB_CREDENTIAL_VARIABLES.map((name) => [name, `secret-${name}`]));
  source.OPENCODE_API_KEY = 'model-key';
  const env = modelEnvironment(source);
  assert.equal(env.OPENCODE_API_KEY, 'model-key');
  for (const name of GITHUB_CREDENTIAL_VARIABLES) assert.equal(env[name], undefined, `${name} must not reach OpenCode`);
});
