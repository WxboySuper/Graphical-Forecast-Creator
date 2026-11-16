import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateStatus, fetchStatus } from './check-mesoscale-health.mjs';

const model = (overrides = {}) => ({ modelId: 'hrrr', latestCycleTime: '2026-11-09T16:00:00Z', ageMinutes: 100, stale: false, health: 'complete', ...overrides });

test('healthy, current models raise no problems', () => {
  assert.deepEqual(evaluateStatus({ status: 'healthy', models: [model(), model({ modelId: 'rap' }), model({ modelId: 'rrfs', health: 'partial' })] }), []);
});

test('a stale model is reported with its age and cycle', () => {
  const [problem] = evaluateStatus({ models: [model({ modelId: 'rrfs', stale: true, ageMinutes: 600, latestCycleTime: '2026-11-09T05:00:00Z' })] });
  assert.match(problem, /RRFS: latest cycle 2026-11-09T05:00:00Z \(600 min old\)/);
  assert.match(problem, /stale/);
});

test('missing, invalid, failed, and unavailable feeds are reported', () => {
  for (const health of ['missing', 'invalid', 'failed', 'unavailable']) {
    const problems = evaluateStatus({ models: [model({ health, latestCycleTime: null, ageMinutes: null })] });
    assert.equal(problems.length, 1, health);
    assert.match(problems[0], /not healthy/);
    assert.match(problems[0], /age unknown/);
  }
});

test('every unhealthy model is listed', () => {
  const problems = evaluateStatus({ models: [model({ stale: true }), model({ modelId: 'rap' }), model({ modelId: 'rrfs', health: 'failed' })] });
  assert.equal(problems.length, 2);
});

test('an unexpected payload is a problem, not a pass', () => {
  assert.equal(evaluateStatus(null).length, 1);
  assert.equal(evaluateStatus({}).length, 1);
  assert.equal(evaluateStatus({ models: [] }).length, 1);
  assert.equal(evaluateStatus({ models: ['x'] }).length, 1);
});

test('fetchStatus reads /status without a doubled slash and rejects non-200 responses', async () => {
  const urls = [];
  const ok = await fetchStatus('https://example.invalid/', async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ models: [model()] }), { status: 200 });
  });
  assert.deepEqual(urls, ['https://example.invalid/status']);
  assert.equal(ok.models.length, 1);
  await assert.rejects(fetchStatus('https://example.invalid', async () => new Response('x', { status: 502 })), /HTTP 502/);
});
