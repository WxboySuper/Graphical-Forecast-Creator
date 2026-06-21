'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  DISABLED_CAPABILITY_STATUS,
  createServerCapabilityGate,
  isServerCapabilityEnabled,
  sendDisabledCapabilityResponse,
} = require('./featureCapabilities');

const getUrl = (server) => {
  const address = server.address();
  return `http://127.0.0.1:${address.port}/api/test`;
};

describe('server capability gates', () => {
  it('stays disabled for unknown capability keys', () => {
    assert.equal(
      isServerCapabilityEnabled('UNKNOWN_CAPABILITY', { env: { UNKNOWN_CAPABILITY: 'true' } }),
      false
    );
  });

  it('requires registry exposure and deployment env to both be enabled', () => {
    const env = { TSTM_GENERATION_ENABLED: 'true', SERVER_TARGET: 'beta' };
    assert.equal(isServerCapabilityEnabled('TSTM_GENERATION_ENABLED', { env }), false);

    assert.equal(
      isServerCapabilityEnabled('TSTM_GENERATION_ENABLED', {
        env,
        exposureOverride: { beta: true },
      }),
      true
    );
  });

  it('rejects disabled capabilities before handlers run', async () => {
    let calls = 0;
    const gate = createServerCapabilityGate('TSTM_GENERATION_ENABLED', {
      env: { TSTM_GENERATION_ENABLED: 'true', SERVER_TARGET: 'beta' },
      exposureOverride: { beta: false },
    });
    const app = express();
    app.post('/api/test', gate, (_req, res) => {
      calls += 1;
      res.status(200).json({ ok: true });
    });
    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.on('error', reject);
    });

    try {
      const response = await fetch(getUrl(server), { method: 'POST' });
      assert.equal(response.status, DISABLED_CAPABILITY_STATUS);
      assert.deepEqual(await response.json(), {
        error: 'Auto-TSTM is not enabled on this deployment.',
      });
      assert.equal(calls, 0);
    } finally {
      server.close();
    }
  });

  it('fails route registration when SERVER_TARGET is invalid', () => {
    assert.throws(
      () => createServerCapabilityGate('TSTM_GENERATION_ENABLED', {
        env: { SERVER_TARGET: 'preview' },
      }),
      /Invalid SERVER_TARGET/
    );
  });

  it('uses a consistent disabled response helper', () => {
    const response = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
      },
    };

    sendDisabledCapabilityResponse(response, { label: 'Auto-TSTM' });
    assert.equal(response.statusCode, DISABLED_CAPABILITY_STATUS);
    assert.deepEqual(response.body, {
      error: 'Auto-TSTM is not enabled on this deployment.',
    });
  });
});
