'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const express = require('express');
const {
  createGenerationPayload,
  isTstmGenerationEnabled,
  registerTstmRoutes,
  runTstmGenerator,
  validatePayload,
} = require('./tstm');

const startServer = (env, runGenerator) => {
  const app = express();
  registerTstmRoutes(app, express, { env, runGenerator });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
};

const getUrl = (server) => {
  const address = server.address();
  return `http://127.0.0.1:${address.port}/api/tstm/generate`;
};

const createFakeChild = () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit('close', null);
  return child;
};

describe('Auto-TSTM server foundation', () => {
  it('stays disabled unless explicitly enabled', () => {
    assert.equal(isTstmGenerationEnabled({}), false);
    assert.equal(isTstmGenerationEnabled({ TSTM_GENERATION_ENABLED: 'false' }), false);
    assert.equal(isTstmGenerationEnabled({ TSTM_GENERATION_ENABLED: 'true' }), true);
  });

  it('normalizes and validates request payloads', () => {
    const payload = createGenerationPayload({ day: '2', cycleDate: '2026-06-13', ignored: true });
    assert.deepEqual(payload, {
      day: 2,
      cycleDate: '2026-06-13',
      issueDate: undefined,
      validDate: undefined,
      issuanceTime: undefined,
    });
    assert.equal(validatePayload(payload), null);
    assert.match(validatePayload({ ...payload, day: 3 }), /Day 1 and Day 2/);
    assert.match(validatePayload({ ...payload, cycleDate: 'bad' }), /cycleDate/);
  });

  it('does not invoke the generator while disabled', async () => {
    let calls = 0;
    const server = await startServer({}, async () => {
      calls += 1;
      return {};
    });
    try {
      const response = await fetch(getUrl(server), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day: 1, cycleDate: '2026-06-13' }),
      });
      assert.equal(response.status, 404);
      assert.equal(calls, 0);
    } finally {
      server.close();
    }
  });

  it('returns sanitized errors when enabled work fails', async () => {
    const server = await startServer(
      { TSTM_GENERATION_ENABLED: 'true' },
      async () => { throw new Error('internal path and stderr'); },
    );
    try {
      const response = await fetch(getUrl(server), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day: 1, cycleDate: '2026-06-13' }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: 'Auto-TSTM guidance is temporarily unavailable.',
      });
    } finally {
      server.close();
    }
  });

  it('rejects malformed generator output', async () => {
    const child = createFakeChild();
    const result = runTstmGenerator(
      { day: 1, cycleDate: '2026-06-13' },
      { spawnProcess: () => child },
    );
    child.stdout.end('not json');
    child.emit('close', 0);
    await assert.rejects(result, /TSTM_GENERATOR_INVALID_JSON/);
  });

  it('terminates a generator that exceeds its timeout', async () => {
    const child = createFakeChild();
    let killed = false;
    child.kill = () => {
      killed = true;
      setImmediate(() => child.emit('close', null));
    };
    await assert.rejects(
      runTstmGenerator(
        { day: 1, cycleDate: '2026-06-13' },
        {
          env: { TSTM_GENERATION_TIMEOUT_MS: '1' },
          spawnProcess: () => child,
        },
      ),
      /TSTM_GENERATION_TIMEOUT/,
    );
    assert.equal(killed, true);
  });
});
