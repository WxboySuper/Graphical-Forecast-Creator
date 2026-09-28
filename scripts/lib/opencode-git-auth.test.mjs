import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubHttpExtraHeader } from './opencode-git-auth.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('GitHub extraheader uses the HTTP Authorization header syntax Git expects', () => {
  const setting = githubHttpExtraHeader('test-token');
  const configuredValue = execFileSync('git', ['-c', setting, 'config', '--get', 'http.https://github.com/.extraheader'], { encoding: 'utf8' }).trim();

  assert.equal(configuredValue, 'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46dGVzdC10b2tlbg==');
  assert.equal(Buffer.from(configuredValue.slice('AUTHORIZATION: basic '.length), 'base64').toString('utf8'), 'x-access-token:test-token');
});

test('GitHub extraheader rejects an empty token', () => {
  assert.throws(() => githubHttpExtraHeader(''), /GitHub token is required/);
});

test('changelog scripts share the validated GitHub auth header for fetch and push', () => {
  const preparation = readFileSync(path.join(repositoryRoot, 'scripts/prepare-changelog-governance.mjs'), 'utf8');
  const publisher = readFileSync(path.join(repositoryRoot, 'scripts/publish-opencode-changelog.mjs'), 'utf8');

  for (const source of [preparation, publisher]) {
    assert.match(source, /import \{ githubHttpExtraHeader \} from '\.\/lib\/opencode-git-auth\.mjs'/);
    assert.match(source, /const gitAuth = githubHttpExtraHeader\(token\)/);
    assert.match(source, /execFileSync\('git', \[\x27-c\x27, gitAuth, \x27fetch\x27/);
  }
  assert.match(preparation, /execFileSync\('git', \[\x27-c\x27, gitAuth, \x27push\x27/);
  assert.match(publisher, /execFileSync\('git', \[\x27-c\x27, githubHttpExtraHeader\(token\), \x27push\x27/);
  assert.doesNotMatch(publisher, /git config --local .*extraheader/);
});
