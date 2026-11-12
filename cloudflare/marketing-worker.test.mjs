import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from './marketing-worker.mjs';
import { LEGACY_PATHS, marketingWorkerFirstPaths } from './marketing-worker-paths.mjs';
import { secureMarketingResponse } from './marketing-worker-response.mjs';

const env = (overrides = {}) => ({
  CANONICAL_HOST: 'gfcweather.com', WWW_HOST: 'www.gfcweather.com', APP_ORIGIN: 'https://app.gfcweather.com', PRODUCTION_WORKER_SHARED_SECRET: 'shared-secret',
  ASSETS: { fetch: async () => new Response('site') }, ...overrides,
});

test('redirects legacy application routes on apex and www to app with 308 and query', async () => {
  for (const host of ['gfcweather.com', 'www.gfcweather.com']) {
    for (const path of ['/forecast', '/forecast/x', '/discussion', '/discussion/x', '/monitor', '/monitor/foo', '/verification', '/verification/report', '/cloud', '/cloud/settings', '/account', '/account/settings', '/admin', '/admin/users', '/beta', '/beta/enroll', '/beta-access', '/beta-access/x']) {
      const response = await worker.fetch(new Request(`https://${host}${path}?from=old`), env());
      assert.equal(response.status, 308, `${host}${path}`);
      assert.equal(response.headers.get('location'), `https://app.gfcweather.com${path}?from=old`);
    }
  }
});

test('wrangler sends every legacy prefix and API path through the Worker', () => {
  const configuration = JSON.parse(readFileSync(new URL('./wrangler.marketing.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(configuration.assets.run_worker_first, marketingWorkerFirstPaths());
  const workerFirst = new Set(configuration.assets.run_worker_first);
  for (const prefix of LEGACY_PATHS) {
    assert.ok(workerFirst.has(prefix), `${prefix} must run through the Worker`);
    assert.ok(workerFirst.has(`${prefix}/*`), `${prefix} subpaths must run through the Worker`);
  }
  assert.ok(workerFirst.has('/api'));
  assert.ok(workerFirst.has('/api/*'));
});

test('does not redirect marketing pricing or updates paths', async () => {
  for (const path of ['/pricing', '/updates']) {
    const response = await worker.fetch(new Request(`https://gfcweather.com${path}`), env());
    assert.equal(await response.text(), 'site');
  }
});

test('returns a no-store 503 when the assets binding rejects', async () => {
  const response = await worker.fetch(new Request('https://gfcweather.com/'), env({ ASSETS: { fetch: async () => { throw new Error('offline'); } } }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects malformed marketing host configuration', async () => {
  for (const host of ['gfcweather.com:443', 'user@gfcweather.com', 'gfcweather.com/path', 'https://gfcweather.com']) {
    const response = await worker.fetch(new Request('https://gfcweather.com/'), env({ CANONICAL_HOST: host }));
    assert.equal(response.status, 503, host);
    assert.equal(response.headers.get('cache-control'), 'no-store', host);
  }
});

test('redirects www alias to apex while preserving path and query and clearing port', async () => {
  const request = new Request('https://www.gfcweather.com:8443/pricing?q=1');
  const response = await worker.fetch(request, env());
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://gfcweather.com/pricing?q=1');
});

test('forwards API method and body through service binding and strips spoofed trusted headers', async () => {
  let forwarded;
  const request = new Request('https://gfcweather.com/api/stripe/webhook?x=1', {
    method: 'POST', headers: { authorization: 'Bearer webhook-key', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', 'x-gfc-worker-client-ip': '198.51.100.1', 'x-gfc-worker-secret': 'spoofed' }, body: '{"ok":true}',
  });
  const response = await worker.fetch(request, env({ APP_WORKER: { fetch: async (req) => { forwarded = req; return new Response('proxied', { status: 202 }); } } }));
  assert.equal(forwarded.url, 'https://app.gfcweather.com/api/stripe/webhook?x=1');
  assert.equal(forwarded.method, 'POST');
  assert.equal(forwarded.headers.get('authorization'), 'Bearer webhook-key');
  assert.equal(await forwarded.text(), '{"ok":true}');
  assert.equal(forwarded.headers.get('x-gfc-worker-client-ip'), '203.0.113.7');
  assert.equal(forwarded.headers.get('x-gfc-worker-secret'), 'shared-secret');
  assert.equal(forwarded.headers.get('cf-connecting-ip'), '203.0.113.7');
  assert.equal(response.status, 202);
});

test('strips URL credentials and hash when forwarding API requests', async () => {
  let forwarded;
  const request = new Request('https://gfcweather.com/api/health?q=1', { headers: { 'cf-connecting-ip': '203.0.113.7' } });
  Object.defineProperty(request, 'url', { value: 'https://user:secret@gfcweather.com/api/health?q=1#fragment' });
  await worker.fetch(request, env({ APP_WORKER: { fetch: async (req) => { forwarded = req; return new Response('ok'); } } }));
  assert.equal(forwarded.url, 'https://app.gfcweather.com/api/health?q=1');
});

test('rejects explicit APP_ORIGIN ports', async () => {
  const response = await worker.fetch(new Request('https://gfcweather.com/'), env({ APP_ORIGIN: 'https://app.gfcweather.com:8443' }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('fails closed without app service binding or assets binding', async () => {
  const api = await worker.fetch(new Request('https://gfcweather.com/api/health'), env());
  assert.equal(api.status, 503);
  assert.equal(api.headers.get('cache-control'), 'no-store');
  const missingAssets = await worker.fetch(new Request('https://gfcweather.com/'), env({ ASSETS: undefined }));
  assert.equal(missingAssets.status, 503);
  const missingOrigin = await worker.fetch(new Request('https://gfcweather.com/'), env({ APP_ORIGIN: undefined }));
  assert.equal(missingOrigin.status, 503);
  assert.equal(missingOrigin.headers.get('cache-control'), 'no-store');
  const missingSecret = await worker.fetch(new Request('https://gfcweather.com/api/health'), env({
    PRODUCTION_WORKER_SHARED_SECRET: undefined,
    APP_WORKER: { fetch: async () => new Response('unexpected') },
  }));
  assert.equal(missingSecret.status, 503);
  assert.equal(missingSecret.headers.get('cache-control'), 'no-store');
  const missingIp = await worker.fetch(new Request('https://gfcweather.com/api/health'), env({
    APP_WORKER: { fetch: async () => new Response('unexpected') },
    PRODUCTION_WORKER_SHARED_SECRET: 'shared-secret',
  }));
  assert.equal(missingIp.status, 503);
  assert.equal(missingIp.headers.get('cache-control'), 'no-store');
});

test('serves the asset 404 and sets marketing security and cache headers', async () => {
  const response = await worker.fetch(new Request('https://gfcweather.com/not-found'), env({ ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } }));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /unpkg/i);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'(;|$)/);
  assert.match(response.headers.get('content-security-policy'), /worker-src 'self' blob:/);
});

test('hashed assets receive immutable caching', async () => {
  const response = await worker.fetch(new Request('https://gfcweather.com/assets/site-Abcdef012345.js'), env());
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('marketing response handles null-body statuses and invalid status text', async () => {
  const response = secureMarketingResponse({
    status: 204,
    statusText: 'invalid\rstatus',
    headers: new Headers(),
    body: new ReadableStream(),
  }, new URL('https://gfcweather.com/'));
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.statusText, '');
});
