import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker, { JOBS, buildDispatchRequest, dispatchJob, jobsForCron } from './mesoscale-scheduler.mjs';

const env = { GITHUB_DISPATCH_TOKEN: 'github_pat_example' };
const ingest = { workflow: 'mesoscale-ingest.yml' };
const release = JOBS['23 3,9,15,21 * * *'][0];

test('builds a workflow dispatch for the ingest on main', () => {
  const { url, init } = buildDispatchRequest(env, ingest);
  assert.equal(url, 'https://api.github.com/repos/WxboySuper/Graphical-Forecast-Creator/actions/workflows/mesoscale-ingest.yml/dispatches');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer github_pat_example');
  assert.deepEqual(JSON.parse(init.body), { ref: 'main' });
});

test('the beta release job only releases when main changed', () => {
  const { url, init } = buildDispatchRequest(env, release);
  assert.ok(url.endsWith('/actions/workflows/release-beta.yml/dispatches'));
  const body = JSON.parse(init.body);
  assert.equal(body.ref, 'main');
  assert.deepEqual(body.inputs, { confirmation: 'RELEASE-BETA', dry_run: 'false', deploy_api: 'true', only_if_changed: 'true' });
  assert.ok(Object.values(body.inputs).every((value) => typeof value === 'string'));
});

test('uses a configured repository and ref', () => {
  const { url, init } = buildDispatchRequest({ ...env, GITHUB_REPOSITORY: 'a/b', WORKFLOW_REF: 'release/1.8' }, ingest);
  assert.equal(url, 'https://api.github.com/repos/a/b/actions/workflows/mesoscale-ingest.yml/dispatches');
  assert.deepEqual(JSON.parse(init.body), { ref: 'release/1.8' });
});

test('refuses to run without a token or with unsafe configuration', () => {
  assert.throws(() => buildDispatchRequest({}, ingest), /GITHUB_DISPATCH_TOKEN/);
  assert.throws(() => buildDispatchRequest({ GITHUB_DISPATCH_TOKEN: '   ' }, ingest), /GITHUB_DISPATCH_TOKEN/);
  assert.throws(() => buildDispatchRequest(undefined, ingest), /GITHUB_DISPATCH_TOKEN/);
  assert.throws(() => buildDispatchRequest({ GITHUB_DISPATCH_TOKEN: 42 }, ingest), /GITHUB_DISPATCH_TOKEN/);
  for (const repository of ['a/b/../c', '../repo', './repo', 'noslash']) {
    assert.throws(() => buildDispatchRequest({ ...env, GITHUB_REPOSITORY: repository }, ingest), /Invalid/);
  }
  for (const ref of ['main; rm', '..', '-main']) {
    assert.throws(() => buildDispatchRequest({ ...env, WORKFLOW_REF: ref }, ingest), /Invalid/);
  }
  // A non-string var falls back to the default instead of crashing.
  assert.equal(JSON.parse(buildDispatchRequest({ ...env, WORKFLOW_REF: 7 }, ingest).init.body).ref, 'main');
});

test('treats HTTP 204 as success and any other status as an error without leaking the token', async () => {
  const ok = await dispatchJob(env, ingest, async () => new Response(null, { status: 204 }));
  assert.equal(ok.workflow, 'mesoscale-ingest.yml');
  assert.ok(Date.parse(ok.dispatchedAt));
  await assert.rejects(
    dispatchJob(env, ingest, async () => new Response('{"message":"Bad credentials"}', { status: 401 })),
    (error) => /HTTP 401: Bad credentials/.test(error.message) && !error.message.includes('github_pat_example'),
  );
});

test('rejects a malformed job before building a request', () => {
  assert.throws(() => buildDispatchRequest(env, undefined), /Invalid scheduler job/);
  assert.throws(() => buildDispatchRequest(env, {}), /Invalid scheduler job/);
  assert.throws(() => buildDispatchRequest(env, { workflow: '../x.yml' }), /Invalid scheduler job/);
  assert.throws(() => buildDispatchRequest(env, { workflow: 'a.yml/../b.yml' }), /Invalid scheduler job/);
  assert.throws(() => buildDispatchRequest(env, { workflow: 'a.yml', inputs: { dry_run: false } }), /Invalid scheduler job/);
  assert.throws(() => buildDispatchRequest(env, { workflow: 'a.yml', inputs: null }), /Invalid scheduler job/);
  assert.throws(() => buildDispatchRequest(env, { workflow: 'a.yml', inputs: [] }), /Invalid scheduler job/);
});

test('a cron event without an expression is an error', async () => {
  await assert.rejects(worker.scheduled(undefined, env), /No scheduler job/);
});

test('an unknown cron expression is an error, not a silent no-op', () => {
  assert.equal(jobsForCron('12,42 * * * *')[0].workflow, 'mesoscale-ingest.yml');
  assert.throws(() => jobsForCron('0 0 * * *'), /No scheduler job/);
});

test('each cron starts its workflow, rejects loudly, and the fetch handler serves nothing', async () => {
  const original = globalThis.fetch;
  try {
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(url);
      return new Response(null, { status: 204 });
    };
    await worker.scheduled({ cron: '12,42 * * * *' }, env);
    await worker.scheduled({ cron: '23 3,9,15,21 * * *' }, env);
    assert.deepEqual(urls.map((url) => url.split('/workflows/')[1]), ['mesoscale-ingest.yml/dispatches', 'release-beta.yml/dispatches']);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await assert.rejects(worker.scheduled({ cron: '12,42 * * * *' }, env), /HTTP 401/);
  } finally {
    globalThis.fetch = original;
  }
  const response = await worker.fetch(new Request('https://example.invalid/'));
  assert.equal(response.status, 404);
});

test('the checked-in config crons match the job table and there are no public routes', () => {
  const config = JSON.parse(readFileSync(new URL('./wrangler.mesoscale-scheduler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual([...config.triggers.crons].sort(), Object.keys(JOBS).sort());
  assert.equal(config.workers_dev, false);
  assert.equal(config.routes, undefined);
});
