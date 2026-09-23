import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  mergeDeploymentConfigs,
  normalizeDeploymentConfig,
  renderServerEnvFile,
} from './deployment-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const WRITE_DEPLOYMENT_ENV_SCRIPT = resolve(ROOT, 'scripts/write-deployment-env.mjs');

describe('deployment config', () => {
  it('normalizes server env values', () => {
    assert.deepEqual(
      normalizeDeploymentConfig({
        serverEnv: {
          TSTM_GENERATION_ENABLED: 'true',
          TSTM_INGESTION_ENABLED: 'false',
        },
      }),
      {
        serverEnv: {
          TSTM_GENERATION_ENABLED: 'true',
          TSTM_INGESTION_ENABLED: 'false',
        },
      }
    );
  });

  it('renders deterministic workflow env file lines', () => {
    assert.equal(
      renderServerEnvFile({
        serverEnv: {
          TSTM_INGESTION_ENABLED: 'true',
          TSTM_GENERATION_ENABLED: 'true',
        },
      }),
      ['TSTM_GENERATION_ENABLED=true', 'TSTM_INGESTION_ENABLED=true'].join('\n')
    );
  });

  it('merges shared defaults with environment overrides', () => {
    assert.deepEqual(
      mergeDeploymentConfigs(
        { environment: 'base', serverEnv: { TSTM_GENERATION_ENABLED: 'true', SHARED: 'base' } },
        { environment: 'override', serverEnv: { SHARED: 'override', TSTM_INGESTION_ENABLED: 'true' } },
      ),
      {
        environment: 'override',
        serverEnv: {
          TSTM_GENERATION_ENABLED: 'true',
          TSTM_INGESTION_ENABLED: 'true',
          SHARED: 'override',
        },
      },
    );
  });

  it('rejects malformed inherited serverEnv overrides', () => {
    assert.throws(
      () => mergeDeploymentConfigs(
        { serverEnv: { SHARED: 'base' } },
        { serverEnv: 'not-an-object' },
      ),
      /override serverEnv must be an object/
    );
  });

  it('rejects missing serverEnv config', () => {
    assert.throws(() => normalizeDeploymentConfig({}), /serverEnv object/);
  });

  it('rejects invalid env keys and non-string values', () => {
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { 'bad-key': 'true' } }),
      /Invalid serverEnv key/
    );
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { TSTM_GENERATION_ENABLED: true } }),
      /must be a string/
    );
  });

  it('rejects values with line breaks', () => {
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { TSTM_GENERATION_ENABLED: 'true\nBAD=1' } }),
      /line breaks/
    );
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { TSTM_GENERATION_ENABLED: 'true\n' } }),
      /line breaks/
    );
  });

  it('renders checked-in deployment config through the CLI', () => {
    const output = execFileSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      'deploy/production-deployment-config.json',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(output, '');
    assert.match(output, /\n$/);
    const lines = output.trimEnd().split('\n');
    assert.deepEqual(
      lines.map((line) => line.split('=', 1)[0]),
      ['PYTHON_BIN', 'TSTM_GENERATION_ENABLED', 'TSTM_INGESTION_ENABLED']
    );
    assert.ok(lines.every((line) => /^[A-Z][A-Z0-9_]*=.+$/.test(line)));
  });

  it('renders the beta Auto-TSTM worker interpreter override', () => {
    const output = execFileSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      'deploy/beta-deployment-config.json',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.match(output, /^PYTHON_BIN=\/opt\/gfc-beta-analytics\/\.venv\/bin\/python$/m);
    assert.match(output, /^TSTM_GENERATION_ENABLED=true$/m);
    assert.match(output, /^TSTM_INGESTION_ENABLED=true$/m);
  });

  it('rejects config paths outside deploy', () => {
    const outsideConfig = resolve(tmpdir(), `gfc-deploy-config-${Date.now()}.json`);
    writeFileSync(outsideConfig, '{"serverEnv":{"TSTM_GENERATION_ENABLED":"true"}}');

    const result = spawnSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      outsideConfig,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /under deploy/);
  });

  it('rejects inherited paths outside deploy and inheritance cycles', () => {
    const testDir = mkdtempSync(join(ROOT, 'deploy', '.gfc-deployment-test-'));
    const outsideDir = mkdtempSync(join(tmpdir(), 'gfc-deployment-outside-'));
    const traversalConfig = join(testDir, 'traversal.json');
    const cycleA = join(testDir, 'cycle-a.json');
    const cycleB = join(testDir, 'cycle-b.json');
    const malformedConfig = join(testDir, 'malformed.json');
    const outsideConfig = join(outsideDir, 'outside.json');
    const symlinkConfig = join(testDir, 'symlink.json');

    try {
      writeFileSync(traversalConfig, JSON.stringify({ extends: '../package.json' }));
      const relativeCycleA = relative(resolve(ROOT, 'deploy'), cycleA);
      const relativeCycleB = relative(resolve(ROOT, 'deploy'), cycleB);
      writeFileSync(cycleA, JSON.stringify({ extends: relativeCycleB, serverEnv: {} }));
      writeFileSync(cycleB, JSON.stringify({ extends: relativeCycleA, serverEnv: {} }));
      writeFileSync(malformedConfig, JSON.stringify({ extends: false, serverEnv: {} }));
      writeFileSync(outsideConfig, JSON.stringify({ serverEnv: { ESCAPED: 'true' } }));
      symlinkSync(outsideConfig, symlinkConfig, 'file');

      const traversalResult = spawnSync(process.execPath, [
        WRITE_DEPLOYMENT_ENV_SCRIPT,
        relative(ROOT, traversalConfig),
      ], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(traversalResult.status, 1);
      assert.match(traversalResult.stderr, /inheritance must stay under deploy/);

      const cycleResult = spawnSync(process.execPath, [
        WRITE_DEPLOYMENT_ENV_SCRIPT,
        relative(ROOT, cycleA),
      ], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(cycleResult.status, 1);
      assert.match(cycleResult.stderr, /inheritance cycle/);

      const malformedResult = spawnSync(process.execPath, [
        WRITE_DEPLOYMENT_ENV_SCRIPT,
        relative(ROOT, malformedConfig),
      ], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(malformedResult.status, 1);
      assert.match(malformedResult.stderr, /extends must be a non-empty string/);

      const symlinkResult = spawnSync(process.execPath, [
        WRITE_DEPLOYMENT_ENV_SCRIPT,
        relative(ROOT, symlinkConfig),
      ], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(symlinkResult.status, 1);
      assert.match(symlinkResult.stderr, /inheritance must stay under deploy/);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('prints readable errors for missing config files', () => {
    const result = spawnSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      'deploy/missing-deployment-config.json',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Failed to read deployment config/);
    assert.doesNotMatch(result.stderr, /at async|at ModuleJob|at file:/);
  });
});
