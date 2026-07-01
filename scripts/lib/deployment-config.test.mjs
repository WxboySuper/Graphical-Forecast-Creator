import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeDeploymentConfig,
  renderServerEnvFile,
} from './deployment-config.mjs';

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
  });
});
