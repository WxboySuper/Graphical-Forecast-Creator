import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from './site-worker.mjs';

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
});

test('redirects www to the canonical host and preserves path and query', async () => {
  const response = await worker.fetch(new Request('https://www.gfcweather.com/forecast?mode=severe&day=2'), {
    CANONICAL_HOST: 'gfcweather.com',
    WWW_HOST: 'www.gfcweather.com',
    ASSETS: { fetch: () => assert.fail('Alias requests must redirect before assets') },
  });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://gfcweather.com/forecast?mode=severe&day=2');
});

test('proxies the complete API path and query without caching API responses', async () => {
  const originalFetch = globalThis.fetch;
  let proxiedRequest;
  globalThis.fetch = async (request, options) => {
    proxiedRequest = request;
    assert.equal(options.cf.cacheTtl, 0);
    return Response.json({ ok: true }, { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request('https://gfcweather.com/api/capabilities/status?detail=full'), {
      API_ORIGIN: 'https://gfc.weatherboysuper.com',
      ASSETS: { fetch: () => assert.fail('API requests must not fall through to assets') },
    });
    assert.equal(proxiedRequest.url, 'https://gfc.weatherboysuper.com/api/capabilities/status?detail=full');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns a fail-closed response when the API origin is missing', async () => {
  const response = await worker.fetch(new Request('https://gfcweather.com/api/capabilities/status'), {
    ASSETS: { fetch: () => assert.fail('API requests must not fall through to assets') },
  });
  assert.equal(response.status, 503);
});
