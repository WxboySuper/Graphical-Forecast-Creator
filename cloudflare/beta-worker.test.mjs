import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './beta-worker.mjs';

test('serves non-API requests from the static asset binding', async () => {
  const request = new Request('https://beta.gfcweather.com/forecast');
  const expected = new Response('asset response');
  let assetRequest;

  const response = await worker.fetch(request, {
    ASSETS: {
      fetch: async (forwardedRequest) => {
        assetRequest = forwardedRequest;
        return expected;
      },
    },
  });

  assert.equal(response, expected);
  assert.equal(assetRequest, request);
});

test('proxies API paths, query strings, request bodies, and response status', async () => {
  const originalFetch = globalThis.fetch;
  const request = new Request('https://beta.gfcweather.com/api/cloud-cycles?cursor=next', {
    method: 'POST',
    headers: { authorization: 'Bearer example-token', 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'test' }),
  });
  let proxiedRequest;

  globalThis.fetch = async (forwardedRequest, options) => {
    proxiedRequest = forwardedRequest;
    assert.equal(options.cf.cacheTtl, 0);
    return Response.json({ saved: true }, { status: 201, headers: { 'x-origin': 'beta-vps' } });
  };

  try {
    const response = await worker.fetch(request, {
      BETA_API_ORIGIN: 'https://beta-gfc.weatherboysuper.com',
      ASSETS: { fetch: () => assert.fail('API paths must not fall through to assets') },
    });

    assert.equal(proxiedRequest.url, 'https://beta-gfc.weatherboysuper.com/api/cloud-cycles?cursor=next');
    assert.equal(proxiedRequest.method, 'POST');
    assert.equal(proxiedRequest.headers.get('authorization'), 'Bearer example-token');
    assert.deepEqual(await proxiedRequest.json(), { name: 'test' });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-origin'), 'beta-vps');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { saved: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects API origins that are missing, invalid, or not HTTPS', async () => {
  for (const origin of [undefined, 'not a URL', 'http://beta.example.test']) {
    const response = await worker.fetch(new Request('https://beta.gfcweather.com/api/tstm/latest'), {
      BETA_API_ORIGIN: origin,
      ASSETS: { fetch: () => assert.fail('Invalid API origin must not fetch assets') },
    });
    assert.equal(response.status, 503);
  }
});
