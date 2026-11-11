import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from './site-worker.mjs';

const apiRequest = (path = '/api/capabilities/status', options = {}) =>
  new Request(`https://gfcweather.com/api${path.startsWith('/api') ? path.slice(4) : path}`, options);

const noAssetsForApi = { fetch: () => assert.fail('API paths must not fall through to assets') };

test('serves application paths from the SPA asset binding on the canonical host', async () => {
  const request = new Request('https://gfcweather.com/forecast/workspace');
  const expected = new Response('app shell');
  let assetRequest;
  const response = await worker.fetch(request, {
    ASSETS: { fetch: async (forwardedRequest) => { assetRequest = forwardedRequest; return expected; } },
  });
  assert.equal(response, expected);
  assert.equal(assetRequest, request);
});

test('the static asset binding response keeps configured security headers', async () => {
  const headers = new Headers({
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  const response = await worker.fetch(new Request('https://gfcweather.com/assets/app.js'), {
    ASSETS: { fetch: async () => new Response('bundle', { headers }) },
  });
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('cache-control'), /immutable/);
});

test('static header rules cover CSP and avoid caching runtime release markers', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /Content-Security-Policy:.*frame-ancestors 'none'/);
  assert.match(headers, /\/assets\/\*[\s\S]*Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/version\.json\s+Cache-Control: no-store/);
  assert.match(headers, /\/alert-banner\.json\s+Cache-Control: no-store/);
  const nginx = readFileSync(new URL('../server/nginx-legacy-redirect.conf', import.meta.url), 'utf8');
  assert.match(nginx, /return 308 https:\/\/gfcweather\.com\$request_uri;/);
});

test('redirects www to the canonical host with a method-preserving permanent redirect', async () => {
  const request = new Request('https://www.gfcweather.com/api/feedback?mode=full', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'test' }),
  });
  const response = await worker.fetch(request, {
    CANONICAL_HOST: 'gfcweather.com',
    WWW_HOST: 'www.gfcweather.com',
    ASSETS: { fetch: () => assert.fail('Alias requests must redirect before assets') },
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://gfcweather.com/api/feedback?mode=full');
});

test('fails closed without redirecting when canonical host is missing or malformed', async () => {
  for (const canonicalHost of [undefined, '', 'www.gfcweather.com', 'GFCWEATHER.com:443', 'user@gfcweather.com', 'gfcweather.com/path']) {
    const response = await worker.fetch(new Request('https://www.gfcweather.com/forecast?day=2'), {
      CANONICAL_HOST: canonicalHost,
      WWW_HOST: 'www.gfcweather.com',
      ASSETS: { fetch: () => assert.fail('Misconfigured alias must fail closed') },
    });
    assert.equal(response.status, 503, String(canonicalHost));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('proxies API method, path, query, body, response status, and no-store headers', async () => {
  const originalFetch = globalThis.fetch;
  const request = apiRequest('/capabilities/status?detail=full', {
    method: 'POST',
    headers: { authorization: 'Bearer example-token', 'content-type': 'application/json' },
    body: JSON.stringify({ check: true }),
  });
  let proxiedRequest;
  globalThis.fetch = async (forwardedRequest, options) => {
    proxiedRequest = forwardedRequest;
    assert.equal(options.cf.cacheTtl, 0);
    return Response.json({ ok: true }, { status: 201, headers: { 'x-origin': 'production-vps' } });
  };
  try {
    const response = await worker.fetch(request, { API_ORIGIN: 'https://gfc.weatherboysuper.com', ASSETS: noAssetsForApi });
    assert.equal(proxiedRequest.url, 'https://gfc.weatherboysuper.com/api/capabilities/status?detail=full');
    assert.equal(proxiedRequest.method, 'POST');
    assert.equal(proxiedRequest.headers.get('authorization'), 'Bearer example-token');
    assert.deepEqual(await proxiedRequest.json(), { check: true });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-origin'), 'production-vps');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the secret paired with the selected API origin and replaces spoofed headers', async () => {
  const originalFetch = globalThis.fetch;
  const request = apiRequest('/test', {
    headers: {
      'cf-connecting-ip': '203.0.113.8',
      'x-gfc-worker-client-ip': '198.51.100.55',
      'x-gfc-worker-secret': 'attacker-value',
    },
  });
  const cases = [
    { API_ORIGIN: 'https://production.example.test', PRODUCTION_WORKER_SHARED_SECRET: 'production-secret', BETA_WORKER_SHARED_SECRET: 'beta-secret', expectedOrigin: 'https://production.example.test/api/test', expectedSecret: 'production-secret' },
    { BETA_API_ORIGIN: 'https://beta.example.test', PRODUCTION_WORKER_SHARED_SECRET: 'production-secret', BETA_WORKER_SHARED_SECRET: 'beta-secret', expectedOrigin: 'https://beta.example.test/api/test', expectedSecret: 'beta-secret' },
  ];
  try {
    for (const env of cases) {
      let proxiedRequest;
      globalThis.fetch = async (forwardedRequest) => { proxiedRequest = forwardedRequest; return new Response('ok'); };
      await worker.fetch(request, { ...env, ASSETS: noAssetsForApi });
      assert.equal(proxiedRequest.url, env.expectedOrigin);
      assert.equal(proxiedRequest.headers.get('x-gfc-worker-client-ip'), '203.0.113.8');
      assert.equal(proxiedRequest.headers.get('x-gfc-worker-secret'), env.expectedSecret);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('strips spoofed worker headers and does not add trusted identity without a secret', async () => {
  const originalFetch = globalThis.fetch;
  const request = apiRequest('/test', {
    headers: {
      'cf-connecting-ip': '203.0.113.8',
      'x-gfc-worker-client-ip': '198.51.100.55',
      'x-gfc-worker-secret': 'attacker-value',
    },
  });
  let proxiedRequest;
  globalThis.fetch = async (forwardedRequest) => { proxiedRequest = forwardedRequest; return new Response('ok'); };
  try {
    await worker.fetch(request, { API_ORIGIN: 'https://gfc.weatherboysuper.com', ASSETS: noAssetsForApi });
    assert.equal(proxiedRequest.headers.has('x-gfc-worker-client-ip'), false);
    assert.equal(proxiedRequest.headers.has('x-gfc-worker-secret'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('forwards valid IPv4 and IPv6 client addresses and drops invalid or missing ones', async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    API_ORIGIN: 'https://gfc.weatherboysuper.com',
    PRODUCTION_WORKER_SHARED_SECRET: 'configured-secret',
    ASSETS: noAssetsForApi,
  };
  const proxy = async (clientIp) => {
    let proxiedRequest;
    globalThis.fetch = async (forwardedRequest) => { proxiedRequest = forwardedRequest; return new Response('ok'); };
    const headers = clientIp === undefined ? {} : { 'cf-connecting-ip': clientIp };
    await worker.fetch(apiRequest('/test', { headers }), env);
    return proxiedRequest.headers.get('x-gfc-worker-client-ip');
  };
  try {
    assert.equal(await proxy('203.0.113.8'), '203.0.113.8');
    assert.equal(await proxy('2001:db8::1'), '2001:db8::1');
    for (const invalid of [undefined, '...', '::::', 'evil', '1.2.3', '999.999.999.999', 'a'.repeat(60)]) {
      assert.equal(await proxy(invalid), null, String(invalid));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('all invalid API-origin branches fail closed without caching', async () => {
  for (const origin of [undefined, '', 'not a URL', 'http://api.example.test', 'https://user@api.example.test', 'https://:pass@api.example.test']) {
    const response = await worker.fetch(apiRequest(), { API_ORIGIN: origin, ASSETS: noAssetsForApi });
    assert.equal(response.status, 503, String(origin));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('returns an uncached 502 when the API origin cannot be reached', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const response = await worker.fetch(apiRequest(), { API_ORIGIN: 'https://gfc.weatherboysuper.com', ASSETS: noAssetsForApi });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the alias redirect drops the port from the target', async () => {
  const response = await worker.fetch(new Request('https://www.gfcweather.com:8443/forecast?day=2'), {
    CANONICAL_HOST: 'gfcweather.com',
    WWW_HOST: 'www.gfcweather.com',
    ASSETS: { fetch: () => assert.fail('Alias requests must redirect before assets') },
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://gfcweather.com/forecast?day=2');
});

test('a missing environment or assets binding fails closed instead of throwing', async () => {
  for (const env of [undefined, {}, { ASSETS: {} }]) {
    const response = await worker.fetch(new Request('https://gfcweather.com/forecast'), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('API requests with no environment fail closed without needing the assets binding', async () => {
  const response = await worker.fetch(apiRequest(), undefined);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('setting both API origins fails closed so beta can never inherit the production origin', async () => {
  const response = await worker.fetch(apiRequest(), {
    API_ORIGIN: 'https://api.example.test',
    BETA_API_ORIGIN: 'https://beta-api.example.test',
    ASSETS: noAssetsForApi,
  });
  assert.equal(response.status, 503);
});
