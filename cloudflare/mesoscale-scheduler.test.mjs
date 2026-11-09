import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker, { buildDispatchRequest, dispatchIngest } from './mesoscale-scheduler.mjs';

const env = { GITHUB_DISPATCH_TOKEN: 'github_pat_example' };

test('builds a workflow dispatch for the ingest on main', () => {
  const { url, init } = buildDispatchRequest(env);
  assert.equal(url, 'https://api.github.com/repos/WxboySuper/Graphical-Forecast-Creator/actions/workflows/mesoscale-ingest.yml/dispatches');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer github_pat_example');
  assert.deepEqual(JSON.parse(init.body), { ref: 'main' });
});

test('uses configured repository, workflow, and ref', () => {
  const { url, init } = buildDispatchRequest({ ...env, GITHUB_REPOSITORY: 'a/b', WORKFLOW_FILE: 'x.yml', WORKFLOW_REF: 'release/1.8' });
  assert.equal(url, 'https://api.github.com/repos/a/b/actions/workflows/x.yml/dispatches');
  assert.deepEqual(JSON.parse(init.body), { ref: 'release/1.8' });
});

test('refuses to run without a token or with unsafe configuration', () => {
  assert.throws(() => buildDispatchRequest({}), /GITHUB_DISPATCH_TOKEN/);
  assert.throws(() => buildDispatchRequest({ GITHUB_DISPATCH_TOKEN: '   ' }), /GITHUB_DISPATCH_TOKEN/);
  assert.throws(() => buildDispatchRequest({ ...env, GITHUB_REPOSITORY: 'a/b/../c' }), /Invalid/);
  assert.throws(() => buildDispatchRequest({ ...env, WORKFLOW_FILE: '../evil.yml' }), /Invalid/);
  assert.throws(() => buildDispatchRequest({ ...env, WORKFLOW_FILE: 'xyaml' }), /Invalid/);
  assert.throws(() => buildDispatchRequest({ ...env, WORKFLOW_REF: 'main; rm' }), /Invalid/);
  assert.throws(() => buildDispatchRequest({ ...env, GITHUB_REPOSITORY: '../repo' }), /Invalid/);
  assert.throws(() => buildDispatchRequest({ ...env, GITHUB_REPOSITORY: './repo' }), /Invalid/);
  assert.throws(() => buildDispatchRequest({ ...env, WORKFLOW_REF: '..' }), /Invalid/);
  assert.throws(() => buildDispatchRequest({ ...env, WORKFLOW_REF: '-main' }), /Invalid/);
  assert.throws(() => buildDispatchRequest(undefined), /GITHUB_DISPATCH_TOKEN/);
  assert.throws(() => buildDispatchRequest({ GITHUB_DISPATCH_TOKEN: 42 }), /GITHUB_DISPATCH_TOKEN/);
  // A non-string var falls back to the default instead of crashing.
  assert.equal(JSON.parse(buildDispatchRequest({ ...env, WORKFLOW_REF: 7 }).init.body).ref, 'main');
});

test('treats HTTP 204 as success and any other status as an error without leaking the token', async () => {
  const ok = await dispatchIngest(env, async () => new Response(null, { status: 204 }));
  assert.ok(Date.parse(ok.dispatchedAt));
  await assert.rejects(
    dispatchIngest(env, async () => new Response('{"message":"Bad credentials"}', { status: 401 })),
    (error) => /HTTP 401: Bad credentials/.test(error.message) && !error.message.includes('github_pat_example'),
  );
});

test('the cron handler dispatches, fails loudly on a rejected token, and the fetch handler serves nothing', async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return new Response(null, { status: 204 }); };
    await worker.scheduled({}, env);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await assert.rejects(worker.scheduled({}, env), /HTTP 401/);
  } finally {
    globalThis.fetch = original;
  }
  const response = await worker.fetch(new Request('https://example.invalid/'));
  assert.equal(response.status, 404);
});

test('the checked-in config has a cron off the start of the hour and no public routes', () => {
  const config = JSON.parse(readFileSync(new URL('./wrangler.mesoscale-scheduler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.triggers.crons, ['12,42 * * * *']);
  assert.equal(config.workers_dev, false);
  assert.equal(config.routes, undefined);
});
