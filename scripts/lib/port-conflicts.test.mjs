import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BETA_PORT_KEEP_TARGET_PATHS,
  canAutoResolveAllBetaPortConflicts,
  classifyBetaPortConflicts,
  isBetaPortKeepTargetPath,
} from './port-conflicts.mjs';

describe('port conflicts', () => {
  it('knows version-policy paths', () => {
    assert.equal(isBetaPortKeepTargetPath('package.json'), true);
    assert.equal(isBetaPortKeepTargetPath('server/package-lock.json'), true);
    assert.equal(isBetaPortKeepTargetPath('src/foo.ts'), false);
    assert.ok(BETA_PORT_KEEP_TARGET_PATHS.includes('pnpm-lock.yaml'));
  });

  it('auto-resolves server dependency lockfile conflicts', () => {
    const result = classifyBetaPortConflicts([
      'server/package.json',
      'server/package-lock.json',
    ]);
    assert.deepEqual(result.autoResolvable, ['server/package.json', 'server/package-lock.json']);
    assert.deepEqual(result.needsHuman, []);
    assert.equal(canAutoResolveAllBetaPortConflicts(result.autoResolvable), true);
  });

  it('classifies conflicts into auto-resolvable and human-needed', () => {
    const result = classifyBetaPortConflicts(['package.json', 'src/map.ts', 'CHANGELOG.md']);
    assert.deepEqual(result.autoResolvable, ['package.json', 'CHANGELOG.md']);
    assert.deepEqual(result.needsHuman, ['src/map.ts']);
  });

  it('can auto-resolve when only policy files conflict', () => {
    assert.equal(canAutoResolveAllBetaPortConflicts(['package.json', 'pnpm-lock.yaml']), true);
    assert.equal(canAutoResolveAllBetaPortConflicts(['package.json', 'src/foo.ts']), false);
    assert.equal(canAutoResolveAllBetaPortConflicts([]), false);
  });
});
