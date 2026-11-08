import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import worker from './mesoscale-worker.mjs';
import { clearTileCatalogCacheForTests } from './mesoscale-worker.mjs';
import { clearPmtilesCacheForTests } from './pmtiles-reader.mjs';
import { createPmtilesFixture, rangeBucket } from './pmtiles-fixture.test-helper.mjs';

const serialTest = (name, run) => test(name, { concurrency: false }, run);
const ORIGIN = 'https://gfc.weatherboysuper.com';
const envFor = (objects = {}, overrides = {}) => ({
  MESOSCALE_BUCKET: {
    get: async (key) => {
      const value = objects[key];
      if (value === undefined) return null;
      const serialized = JSON.stringify(value);
      return { size: new TextEncoder().encode(serialized).byteLength, json: async () => structuredClone(value), body: new Blob([serialized]).stream(), httpEtag: '"obj-1"', httpMetadata: { contentType: key.endsWith('.png') ? 'image/png' : 'application/json' } };
    },
  },
  CORS_ALLOWED_ORIGINS: `${ORIGIN},https://staging-gfc.weatherboysuper.com,https://beta.gfcweather.com,http://localhost:3000,http://localhost:3002`,
  PUBLIC_BASE_URL: 'https://mesoscale.example.test',
  ...overrides,
});

const request = (path, options = {}) => new Request(`https://mesoscale.example.test${path}`, options);
const countBucketReads = (bucket, methods = ['get']) => {
  let reads = 0;
  for (const method of methods) {
    const original = bucket[method];
    if (typeof original !== 'function') continue;
    bucket[method] = async (...args) => {
      reads += 1;
      return original.apply(bucket, args);
    };
  }
  return () => reads;
};
const assertLongImmutableCache = (response) => {
  const value = response.headers.get('Cache-Control') ?? '';
  const match = value.match(/^public, max-age=(\d+), immutable$/);
  assert.ok(match, `expected an immutable public cache policy, received ${value}`);
  assert.ok(Number(match[1]) >= 31536000, `expected a one-year minimum TTL, received ${match[1]} seconds`);
};
const pointer = (modelId, cycleTime = '2026-11-08T12:00:00Z') => ({ schemaVersion: 1, modelId, cycleTime, catalogUrl: 'https://old.example/catalog.json', publishedAt: '2026-11-08T12:04:00Z' });
const makeCatalog = (overrides = {}) => ({
  schemaVersion: 1,
  model: { id: 'hrrr' },
  cycleTime: '2026-11-08T12:00:00Z',
  status: 'complete',
  domain: { minZoom: 3, maxZoom: 6 },
  frames: [{ forecastHour: 0, parameters: [] }],
  ...overrides,
});
const tileCatalog = makeCatalog({ frames: [{ forecastHour: 0, parameters: [{
  id: 'temperature-2m', data: {
    type: 'xyz-raster', urlTemplate: 'https://mesoscale.example.test/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png',
    format: 'image/png', tileCompression: 'none',
    archiveKey: 'mesoscale/v1/archives/hrrr/20261108T1200Z/f00/temperature-2m.pmtiles', minZoom: 3, maxZoom: 4,
  },
}] }] });
const tileEnvFor = (bucket, catalog = tileCatalog) => {
  clearTileCatalogCacheForTests();
  clearPmtilesCacheForTests();
  const get = bucket.get.bind(bucket);
  bucket.get = async (key, options) => {
    if (key === 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json') {
      const serialized = JSON.stringify(catalog);
      return { size: new TextEncoder().encode(serialized).length, json: async () => structuredClone(catalog) };
    }
    return get(key, options);
  };
  return envFor({}, { MESOSCALE_BUCKET: bucket });
};
const withNow = async (timestamp, run) => {
  const originalNow = Date.now;
  Date.now = () => new Date(timestamp).getTime();
  try {
    return await run();
  } finally {
    Date.now = originalNow;
  }
};

// These helpers patch shared globals; serialTest explicitly disables test concurrency.
const withCache = async (run) => {
  const originalCaches = globalThis.caches;
  const entries = new Map();
  const cache = {
    match: async (key) => entries.get(`${key.method}:${key.url}`)?.clone(),
    put: async (key, value) => { entries.set(`${key.method}:${key.url}`, value.clone()); },
  };
  globalThis.caches = { default: cache };
  try {
    return await run(cache);
  } finally {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
};

describe('mesoscale worker', { concurrency: false }, () => {
serialTest('strictly whitelists route segments and rejects traversal attempts without R2 reads', async () => {
  let reads = 0;
  const env = envFor({}, { MESOSCALE_BUCKET: {
    get: async () => { reads += 1; return null; },
    head: async () => { reads += 1; return null; },
  } });
  for (const path of [
    '/catalog/other/20261108T1200Z.json',
    '/catalog/hrrr/20261108T1201Z.json',
    '/catalog/hrrr/20261108T1200Z.json/extra',
    '/catalog/hrrr/%2e%2e.json',
    '/latest/%2e%2e/secret.json',
    '/latest/hrrr%2Fsecret.json',
    '/tiles/hrrr/20261108T1200Z/f00/%2e%2e/3/0/0.png',
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/8/0.png',
    '/tiles/hrrr/20261108T1200Z/f00/temp/25/0/0.png',
    // XYZ coordinates are capped at eight digits because the maximum zoom is 24.
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/999999999999999999999/0.png',
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/0/999999999999999999999.png',
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/0/0%2epng',
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/0/0.png/extra',
  ]) {
    assert.equal((await worker.fetch(request(path), env)).status, 404, path);
  }
  assert.equal(reads, 0);
});

serialTest('valid tile requests resolve catalog keys only inside the v1 namespace', async () => {
  let key;
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (requestedKey) => { key = requestedKey; return null; } } });
  assert.equal((await worker.fetch(request('/tiles/rrfs/20261108T1200Z/f03/temperature-2m/6/2/1.png'), env)).status, 404);
  assert.equal(key, 'mesoscale/v1/catalog/rrfs/20261108T1200Z.json');
});

serialTest('CORS allows configured origins and omits permission for other origins', async () => {
  const env = envFor();
  const allowed = await worker.fetch(request('/latest/hrrr.json', { headers: { Origin: ORIGIN } }), env);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(allowed.headers.get('Vary') ?? '', /Origin/);
  const localBeta = await worker.fetch(request('/status', { headers: { Origin: 'http://localhost:3002' } }), env);
  assert.equal(localBeta.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3002');
  assert.match(localBeta.headers.get('Vary') ?? '', /Origin/);
  const denied = await worker.fetch(request('/latest/hrrr.json', { headers: { Origin: 'https://attacker.example' } }), env);
  assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  assert.match(denied.headers.get('Vary') ?? '', /Origin/);
  for (const spoof of [`${ORIGIN}.evil.com`, `${ORIGIN}/`, ORIGIN.toUpperCase()]) {
    const response = await worker.fetch(request('/latest/hrrr.json', { headers: { Origin: spoof } }), env);
    assert.equal(response.headers.has('Access-Control-Allow-Origin'), false, spoof);
  }
  const noOrigin = await worker.fetch(request('/status'), env);
  assert.equal(noOrigin.headers.has('Access-Control-Allow-Origin'), false);
  assert.match(noOrigin.headers.get('Vary') ?? '', /Origin/);
  assert.equal((await noOrigin.json()).status, 'degraded');
  const preflight = await worker.fetch(request('/status', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, OPTIONS');
  const deniedPreflight = await worker.fetch(request('/status', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } }), env);
  assert.equal(deniedPreflight.status, 403);
  assert.match(deniedPreflight.headers.get('Vary') ?? '', /Origin/);
  const noOriginPreflight = await worker.fetch(request('/status', { method: 'OPTIONS' }), env);
  assert.equal(noOriginPreflight.status, 204);
  assert.equal(noOriginPreflight.headers.has('Access-Control-Allow-Origin'), false);
  assert.match(noOriginPreflight.headers.get('Vary') ?? '', /Origin/);
});

serialTest('cycle catalog uses immutable caching, validates stored identity, and supports ETag 304', async () => {
  const cycleTime = '2026-11-08T12:00:00Z';
  const catalog = makeCatalog({ cycleTime, frames: [{ forecastHour: 0, parameters: [{ id: 'temperature-2m', data: { type: 'xyz-raster', urlTemplate: 'https://old.example/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png' } }] }] });
  const env = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog });
  const response = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env);
  assertLongImmutableCache(response);
  assert.equal((await response.json()).frames[0].parameters[0].data.urlTemplate, 'https://mesoscale.example.test/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png');
  const etag = response.headers.get('ETag');
  assert.ok(etag, 'expected synthesized catalog ETag');
  assert.notEqual(etag, '"obj-1"');
  const otherHostEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog }, { PUBLIC_BASE_URL: 'https://other-mesoscale.example.test' });
  const otherHostResponse = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), otherHostEnv);
  assert.notEqual(otherHostResponse.headers.get('ETag'), etag);
  const equivalentOriginEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog }, { PUBLIC_BASE_URL: 'HTTPS://MESOSCALE.EXAMPLE.TEST:443/' });
  const equivalentOrigin = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), equivalentOriginEnv);
  assert.equal(equivalentOrigin.status, 200);
  const notModified = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': etag } }), env);
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.has('Content-Type'), false);
  assert.equal(notModified.headers.get('ETag'), etag);
  const etagList = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': `"other", ${etag}` } }), env);
  assert.equal(etagList.status, 304);
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': etag.replace(/^W\//, '') } }), env)).status, 304);
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': '*' } }), env)).status, 304);
  const pathBaseEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog }, { PUBLIC_BASE_URL: 'https://mesoscale.example.test/catalog' });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), pathBaseEnv)).status, 503);
  const missingBaseEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog }, { PUBLIC_BASE_URL: '' });
  const missingBaseConditional = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': '"obj-1"' } }), missingBaseEnv);
  assert.equal(missingBaseConditional.status, 503);
  const malformedFrame = { ...catalog, frames: [null] };
  const malformedFrameEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': malformedFrame });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), malformedFrameEnv)).status, 502);
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { method: 'HEAD' }), malformedFrameEnv)).status, 502);
  const mismatchedTemplate = structuredClone(catalog);
  mismatchedTemplate.frames[0].parameters[0].data.urlTemplate = 'https://old.example/tiles/rap/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png';
  const mismatchedTemplateEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': mismatchedTemplate });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), mismatchedTemplateEnv)).status, 502);
  const queryTemplate = structuredClone(catalog);
  queryTemplate.frames[0].parameters[0].data.urlTemplate += '?token=unexpected';
  const queryTemplateEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': queryTemplate });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), queryTemplateEnv)).status, 502);
  const mismatchedCatalog = { ...catalog, model: { id: 'rap' } };
  const mismatchedCatalogEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': mismatchedCatalog });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), mismatchedCatalogEnv)).status, 502);
  let parsedConditionalCatalog = false;
  const malformedConditionalCatalog = envFor({}, { MESOSCALE_BUCKET: { get: async () => ({ size: 16, json: async () => { parsedConditionalCatalog = true; throw new SyntaxError('invalid'); }, httpEtag: '"obj-1"' }) } });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': etag } }), malformedConditionalCatalog)).status, 502);
  assert.equal(parsedConditionalCatalog, true);
});

serialTest('serves schema-valid partial and failed catalogs as diagnostic cycles', async () => {
  const path = '/catalog/hrrr/20261108T1200Z.json';
  for (const status of ['partial', 'failed']) {
    const catalog = makeCatalog({ status });
    const env = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog });
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, status);
  }
  const unknownStatus = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': makeCatalog({ status: 'unknown' }) });
  assert.equal((await worker.fetch(request(path), unknownStatus)).status, 502);
  const latest = await worker.fetch(request('/latest/hrrr.json'), envFor());
  assert.equal(latest.status, 404);
});

serialTest('Cache API separates rewritten catalog representations by public base URL', async () => {
  await withCache(async () => {
    const catalog = makeCatalog({ frames: [{ forecastHour: 0, parameters: [{ id: 'temperature-2m', data: { type: 'xyz-raster', urlTemplate: 'https://old.example/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png' } }] }] });
    const key = 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json';
    const bucket = { get: async () => ({ size: new TextEncoder().encode(JSON.stringify(catalog)).byteLength, json: async () => structuredClone(catalog), httpEtag: '"catalog"' }) };
    const reads = countBucketReads(bucket);
    const firstEnv = envFor({ [key]: catalog }, { MESOSCALE_BUCKET: bucket, PUBLIC_BASE_URL: 'https://first.example.test' });
    const secondEnv = envFor({ [key]: catalog }, { MESOSCALE_BUCKET: bucket, PUBLIC_BASE_URL: 'https://second.example.test' });
    const normalizedEnv = envFor({ [key]: catalog }, { MESOSCALE_BUCKET: bucket, PUBLIC_BASE_URL: 'https://first.example.test/' });
    const path = '/catalog/hrrr/20261108T1200Z.json';
    const first = await worker.fetch(request(path), firstEnv);
    const second = await worker.fetch(request(path), secondEnv);
    const normalized = await worker.fetch(request(path), normalizedEnv);
    assert.match((await first.json()).frames[0].parameters[0].data.urlTemplate, /^https:\/\/first\.example\.test/);
    assert.match((await second.json()).frames[0].parameters[0].data.urlTemplate, /^https:\/\/second\.example\.test/);
    assert.match((await normalized.json()).frames[0].parameters[0].data.urlTemplate, /^https:\/\/first\.example\.test/);
    assert.equal(reads(), 2);
  });
});

serialTest('catalog and latest do not emit an ETag when R2 omits one', async () => {
  const catalog = makeCatalog();
  const pointerValue = pointer('hrrr');
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => {
    const value = key.includes('/catalog/') ? catalog : pointerValue;
    return { size: new TextEncoder().encode(JSON.stringify(value)).byteLength, json: async () => structuredClone(value) };
  } } });
  const catalogResult = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env);
  const latestResult = await worker.fetch(request('/latest/hrrr.json'), env);
  assert.equal(catalogResult.status, 200);
  assert.equal(latestResult.status, 200);
  assert.equal(catalogResult.headers.get('ETag'), null);
  assert.equal(latestResult.headers.get('ETag'), null);
});

serialTest('missing tile is a short-cache 404 and missing latest pointer is also a 404', async () => {
  const env = envFor();
  const tile = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env);
  assert.equal(tile.status, 404);
  assert.equal(tile.headers.get('Cache-Control'), 'public, max-age=60');
  assert.equal((await worker.fetch(request('/latest/hrrr.json'), env)).status, 404);
});

serialTest('tile response defaults to PNG content type when R2 metadata is absent', async () => {
  clearPmtilesCacheForTests();
  const env = tileEnvFor(rangeBucket(await createPmtilesFixture()));
  const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('Content-Length'), '3');
});

serialTest('invalid catalog archive data returns a controlled gateway response', async () => {
  const catalog = structuredClone(tileCatalog);
  delete catalog.frames[0].parameters[0].data;
  const env = tileEnvFor(rangeBucket(await createPmtilesFixture()), catalog);
  const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /catalog/);
});

serialTest('tile HEAD reads directory ranges but skips the tile payload', async () => {
  clearPmtilesCacheForTests();
  const bucket = rangeBucket(await createPmtilesFixture());
  const env = tileEnvFor(bucket);
  const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png', { method: 'HEAD' }), env);
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('Content-Length'), '3');
  assert.equal(bucket.reads.length, 2);
});

serialTest('malformed archives return a safe gateway error', async () => {
  clearPmtilesCacheForTests();
  const archive = await createPmtilesFixture();
  archive[0] = 0;
  const env = tileEnvFor(rangeBucket(archive));
  const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env);
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /temporarily unavailable/);
  assert.doesNotMatch(body, /PMTiles|offset|range failed/i);
});

serialTest('catalog HEAD validates the stored catalog and matches GET status and validators', async () => {
  let gets = 0;
  let heads = 0;
  const catalog = makeCatalog();
  const baseEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog });
  const env = envFor({}, { MESOSCALE_BUCKET: {
    get: async (...args) => { gets += 1; return baseEnv.MESOSCALE_BUCKET.get(...args); },
    head: async () => { heads += 1; return { httpEtag: '"catalog-head"' }; },
  } });
  const path = '/catalog/hrrr/20261108T1200Z.json';
  const head = await worker.fetch(request(path, { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.ok(head.headers.get('ETag'));
  const get = await worker.fetch(request(path), env);
  assert.equal(get.status, head.status);
  assert.equal(get.headers.get('ETag'), head.headers.get('ETag'));
  const conditional = await worker.fetch(request(path, { method: 'HEAD', headers: { 'If-None-Match': head.headers.get('ETag') } }), env);
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.has('Content-Type'), false);
  assert.equal(heads, 0);
  assert.equal(gets, 3);
});

serialTest('tile HEAD warms metadata and the following GET reads only the tile bytes', async () => {
  await withCache(async () => {
    clearPmtilesCacheForTests();
    const bucket = rangeBucket(await createPmtilesFixture());
    const env = tileEnvFor(bucket);
    const path = '/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png';
    const head = await worker.fetch(request(path, { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(bucket.reads.length, 2);
    assert.equal((await worker.fetch(request(path), env)).status, 200);
    assert.equal(bucket.reads.length, 3);
  });
});

serialTest('Cache API stores tiles, serves hits, honors conditional hits, and caches missing tiles', async () => {
  await withCache(async () => {
    clearPmtilesCacheForTests();
    const bucket = rangeBucket(await createPmtilesFixture());
    const env = tileEnvFor(bucket);
    const path = '/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png';
    const first = await worker.fetch(request(path), env);
    assert.equal(first.status, 200);
    assert.deepEqual([...new Uint8Array(await first.arrayBuffer())], [137, 80, 78]);
    const etag = first.headers.get('ETag');
    assert.equal(first.headers.get('Content-Type'), 'image/png');
    assertLongImmutableCache(first);
    assert.equal(first.headers.get('X-Content-Type-Options'), 'nosniff');
    const hit = await worker.fetch(request(path), env);
    assert.equal(hit.status, 200);
    assert.equal(bucket.reads.length, 3);
    assert.equal((await worker.fetch(request(`${path}?cacheBust=1`), env)).status, 200);
    assert.equal(bucket.reads.length, 3);
    const conditionalHit = await worker.fetch(request(path, { headers: { 'If-None-Match': etag } }), env);
    assert.equal(conditionalHit.status, 304);
    assert.equal(conditionalHit.headers.has('Content-Type'), false);
    assert.equal(conditionalHit.headers.has('Content-Length'), false);
    assert.equal(bucket.reads.length, 3);
    const head = await worker.fetch(request(path, { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(bucket.reads.length, 3);

    const missingPath = '/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/1/1.png';
    assert.equal((await worker.fetch(request(missingPath), env)).status, 404);
    assert.equal((await worker.fetch(request(missingPath), env)).status, 404);
    assert.equal(bucket.reads.length, 3);
  });
});

serialTest('catalog HEAD warms the validated GET Cache API representation', async () => {
  await withCache(async () => {
    const key = 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json';
    const env = envFor({ [key]: makeCatalog() });
    const reads = countBucketReads(env.MESOSCALE_BUCKET);
    const path = '/catalog/hrrr/20261108T1200Z.json';
    const head = await worker.fetch(request(path, { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal((await worker.fetch(request(path), env)).status, 200);
    assert.equal(reads(), 1);
  });
});

serialTest('cache read failure falls back to R2 and put uses waitUntil when available', async () => {
  await withCache(async (cache) => {
    cache.match = async () => { throw new Error('cache unavailable'); };
    clearPmtilesCacheForTests();
    const bucket = rangeBucket(await createPmtilesFixture());
    const env = tileEnvFor(bucket);
    const tasks = [];
    const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env, { waitUntil: (task) => tasks.push(task) });
    assert.equal(response.status, 200);
    assert.equal(bucket.reads.length, 3);
    assert.equal(tasks.length, 0);
    cache.match = async () => undefined;
    const cachedWriteResponse = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png?miss=1'), env, { waitUntil: (task) => tasks.push(task) });
    assert.equal(cachedWriteResponse.status, 200);
    assert.equal(bucket.reads.length, 4);
    assert.equal(tasks.length, 1);
    await Promise.all(tasks);
  });
});

serialTest('latest pointer reports live age and stale state without changing its cycle identity', async () => {
  const env = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') }, { STALE_AFTER_MINUTES: '60' });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/latest/hrrr.json'), env);
    const value = await response.json();
    assert.equal(value.cycleTime, '2026-11-08T12:00:00Z');
    assert.equal(value.catalogUrl, 'https://mesoscale.example.test/catalog/hrrr/20261108T1200Z.json');
    assert.equal(response.headers.get('X-Mesoscale-Stale'), 'true');
    assert.equal(Number(response.headers.get('X-Mesoscale-Age-Minutes')) > 60, true);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=5');
    const notModified = await worker.fetch(request('/latest/hrrr.json', { headers: { 'If-None-Match': response.headers.get('ETag') } }), env);
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get('X-Mesoscale-Stale'), 'true');
    assert.equal(notModified.headers.has('Content-Type'), false);
    await withNow('2026-11-08T15:30:00Z', async () => {
      const laterNotModified = await worker.fetch(request('/latest/hrrr.json', { headers: { 'If-None-Match': response.headers.get('ETag') } }), env);
      assert.equal(laterNotModified.status, 304);
      assert.equal(laterNotModified.headers.get('X-Mesoscale-Age-Minutes'), '210');
    });
    const invalidThreshold = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') }, { STALE_AFTER_MINUTES: 'abc' });
    const invalidConfigResponse = await worker.fetch(request('/latest/hrrr.json'), invalidThreshold);
    assert.equal(invalidConfigResponse.headers.get('X-Mesoscale-Stale'), 'true');
    const emptyThreshold = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') }, { STALE_AFTER_MINUTES: '' });
    assert.equal((await worker.fetch(request('/latest/hrrr.json'), emptyThreshold)).headers.get('X-Mesoscale-Stale'), 'true');
    const future = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr', '2026-11-08T16:00:00Z') });
    const futureResponse = await worker.fetch(request('/latest/hrrr.json'), future);
    assert.equal(futureResponse.headers.get('X-Mesoscale-Age-Minutes'), 'unknown');
    assert.equal(futureResponse.headers.get('X-Mesoscale-Stale'), 'true');
    const fresh = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr', '2026-11-08T15:00:00Z') }, { STALE_AFTER_MINUTES: '60' });
    const freshResponse = await worker.fetch(request('/latest/hrrr.json'), fresh);
    assert.equal(freshResponse.headers.get('X-Mesoscale-Stale'), 'false');
  });
});

serialTest('latest treats small future cycle skew as age zero and larger skew as stale', async () => {
  const path = '/latest/hrrr.json';
  await withNow('2026-11-08T11:58:00Z', async () => {
    const smallSkew = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr', '2026-11-08T12:00:00Z') });
    const response = await worker.fetch(request(path), smallSkew);
    assert.equal(response.headers.get('X-Mesoscale-Age-Minutes'), '0');
    assert.equal(response.headers.get('X-Mesoscale-Stale'), 'false');
    assert.equal((await response.json()).cycleTime, '2026-11-08T12:00:00Z');
  });
  await withNow('2026-11-08T11:54:00Z', async () => {
    const largeSkew = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr', '2026-11-08T12:00:00Z') });
    const response = await worker.fetch(request(path), largeSkew);
    assert.equal(response.headers.get('X-Mesoscale-Age-Minutes'), 'unknown');
    assert.equal(response.headers.get('X-Mesoscale-Stale'), 'true');
  });
});

serialTest('latest recalculates age on Worker Cache API hits', async () => {
  await withCache(async () => {
    let reads = 0;
    const value = pointer('hrrr');
    const serialized = JSON.stringify(value);
    const env = envFor({}, { MESOSCALE_BUCKET: { get: async () => {
      reads += 1;
      return { size: new TextEncoder().encode(serialized).byteLength, json: async () => structuredClone(value), httpEtag: '"latest"' };
    } } });
    await withNow('2026-11-08T15:01:00Z', async () => {
      // Cycle 12:00Z to 15:01Z is 181 minutes; one minute later it is 182.
      const first = await worker.fetch(request('/latest/hrrr.json'), env);
      assert.equal(first.headers.get('X-Mesoscale-Age-Minutes'), '181');
      await withNow('2026-11-08T15:02:00Z', async () => {
        const second = await worker.fetch(request('/latest/hrrr.json'), env);
        assert.equal(second.headers.get('X-Mesoscale-Age-Minutes'), '182');
      });
    });
    assert.equal(reads, 1);
  });
});

serialTest('status recalculates age on Worker Cache API hits', async () => {
  await withCache(async () => {
    let reads = 0;
    const value = pointer('hrrr');
    const serialized = JSON.stringify(value);
    const env = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => {
      reads += 1;
      if (key !== 'mesoscale/v1/latest/hrrr.json') return null;
      return { size: new TextEncoder().encode(serialized).byteLength, json: async () => structuredClone(value) };
    } } });
    await withNow('2026-11-08T15:01:00Z', async () => {
      const first = await worker.fetch(request('/status'), env);
      const firstBody = await first.json();
      assert.equal(firstBody.models.find((model) => model.modelId === 'hrrr').ageMinutes, 181);
      const firstReads = reads;
      assert.ok(firstReads > 0);
      await withNow('2026-11-08T15:02:00Z', async () => {
        const second = await worker.fetch(request('/status'), env);
        const secondBody = await second.json();
        assert.equal(secondBody.models.find((model) => model.modelId === 'hrrr').ageMinutes, 182);
        assert.notEqual(second.headers.get('ETag'), first.headers.get('ETag'));
      });
      assert.equal(reads, firstReads, 'the short-lived cache hit avoids another R2 fan-out');
    });
  });
});

serialTest('status aggregates latest pointers and current or previous daily health records', async () => {
  const env = envFor({
    'mesoscale/v1/latest/hrrr.json': pointer('hrrr'),
    'mesoscale/v1/latest/rap.json': pointer('rap'),
    'mesoscale/v1/health/2026-11-08/hrrr.json': { schemaVersion: 1, modelId: 'hrrr', status: 'complete', generatedAt: '2026-11-08T12:10:00Z' },
    'mesoscale/v1/health/2026-11-07/hrrr.json': { schemaVersion: 1, modelId: 'hrrr', status: 'unknown', generatedAt: '2026-11-07T23:10:00Z' },
    'mesoscale/v1/health/2026-11-07/rap.json': { schemaVersion: 1, modelId: 'rap', status: 'partial', generatedAt: '2026-11-07T23:10:00Z' },
  });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/status'), env);
    const body = await response.json();
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=5');
    assert.equal(body.models.length, 3);
    assert.equal(body.models.find((item) => item.modelId === 'hrrr').health, 'complete');
    assert.equal(body.models.find((item) => item.modelId === 'rap').health, 'partial');
    assert.equal(body.models.find((item) => item.modelId === 'rrfs').health, 'missing');
    assert.equal(body.status, 'degraded');
    const notModified = await worker.fetch(request('/status', { headers: { 'If-None-Match': response.headers.get('ETag') } }), env);
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get('ETag'), response.headers.get('ETag'));
  });
});

serialTest('malformed catalog and pointer JSON produce explicit gateway errors', async () => {
  const malformed = { size: 8, json: async () => { throw new SyntaxError('invalid'); }, httpEtag: '"bad"' };
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async () => malformed } });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env)).status, 502);
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { method: 'HEAD' }), env)).status, 502);
  const path = '/catalog/hrrr/20261108T1200Z.json';
  const validWithSameObjectEtag = envFor({}, { MESOSCALE_BUCKET: { get: async () => ({ size: 16, json: async () => makeCatalog(), httpEtag: '"bad"' }) } });
  const matchingEtag = (await worker.fetch(request(path), validWithSameObjectEtag)).headers.get('ETag');
  assert.ok(matchingEtag);
  assert.equal((await worker.fetch(request(path, { headers: { 'If-None-Match': matchingEtag } }), env)).status, 502);
  assert.equal((await worker.fetch(request('/latest/hrrr.json'), env)).status, 502);
  let parsedOversized = false;
  const oversized = { size: 5 * 1024 * 1024, json: async () => { parsedOversized = true; throw new Error('must reject before parsing'); } };
  const oversizedEnv = envFor({}, { MESOSCALE_BUCKET: { get: async () => oversized } });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), oversizedEnv)).status, 502);
  assert.equal(parsedOversized, false);
  let parsedUnknownSize = false;
  const unknownSize = { json: async () => { parsedUnknownSize = true; return {}; } };
  const unknownSizeResponse = await worker.fetch(request('/latest/hrrr.json'), envFor({}, { MESOSCALE_BUCKET: { get: async () => unknownSize } }));
  assert.equal(unknownSizeResponse.status, 502);
  assert.equal(parsedUnknownSize, false);
});

serialTest('status labels malformed pointer JSON as invalid instead of missing', async () => {
  let parsedMalformedPointer = false;
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => key === 'mesoscale/v1/latest/hrrr.json' ? { size: 16, json: async () => { parsedMalformedPointer = true; throw new SyntaxError('invalid'); } } : null } });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/status'), env);
    const body = await response.json();
    assert.equal(body.models.find((model) => model.modelId === 'hrrr').health, 'invalid');
  });
  assert.equal(parsedMalformedPointer, true);
});

serialTest('status labels parsed records with missing required fields as invalid', async () => {
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => {
    if (key === 'mesoscale/v1/latest/hrrr.json') return { size: 70, json: async () => ({ schemaVersion: 1, modelId: 'rap', cycleTime: '2026-11-08T12:00:00Z' }) };
    if (key === 'mesoscale/v1/health/2026-11-08/hrrr.json') return { size: 70, json: async () => ({ schemaVersion: 1, modelId: 'hrrr', generatedAt: '2026-11-08T15:00:00Z' }) };
    return null;
  } } });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/status'), env);
    const model = (await response.json()).models.find((item) => item.modelId === 'hrrr');
    assert.equal(model.latestCycleTime, null);
    assert.equal(model.health, 'invalid');
  });
});

serialTest('status degrades on R2 read errors and rejects unsupported health states', async () => {
  const env = envFor({}, {
    MESOSCALE_BUCKET: { get: async (key) => {
      if (key === 'mesoscale/v1/health/2026-11-08/hrrr.json') return { size: 92, json: async () => ({ schemaVersion: 1, modelId: 'hrrr', generatedAt: '2026-11-08T13:00:00Z', status: 'complete' }) };
      if (key === 'mesoscale/v1/latest/hrrr.json') throw new Error('temporary R2 read failure');
      return null;
    } },
  });
  const response = await withNow('2026-11-08T15:00:00Z', () => worker.fetch(request('/status'), env));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.status, 'degraded');
  assert.equal(value.models.find((model) => model.modelId === 'hrrr').health, 'unavailable');
  const unsupportedHealth = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => {
    if (key === 'mesoscale/v1/health/2026-11-08/hrrr.json') return { size: 90, json: async () => ({ schemaVersion: 1, modelId: 'hrrr', generatedAt: '2026-11-08T13:00:00Z', status: 'mystery' }) };
    return null;
  } } });
  const unsupported = await withNow('2026-11-08T15:00:00Z', () => worker.fetch(request('/status'), unsupportedHealth));
  assert.equal((await unsupported.json()).models.find((model) => model.modelId === 'hrrr').health, 'invalid');
});

serialTest('HEAD returns headers without a body, and unsupported methods return 405', async () => {
  const env = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') }, { STALE_AFTER_MINUTES: '1' });
  await withNow('2026-11-08T15:00:00Z', async () => {
    const head = await worker.fetch(request('/latest/hrrr.json', { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(head.headers.get('X-Mesoscale-Stale'), 'true');
  });
  const catalog = makeCatalog();
  const catalogEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog });
  const catalogHead = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { method: 'HEAD' }), catalogEnv);
  assert.equal(catalogHead.status, 200);
  assert.equal(catalogHead.body, null);
  assert.ok(catalogHead.headers.get('ETag'));
  assert.equal(catalogHead.headers.get('Content-Type'), 'application/json; charset=utf-8');
  clearPmtilesCacheForTests();
  const tileEnv = tileEnvFor(rangeBucket(await createPmtilesFixture()));
  const tileHead = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png', { method: 'HEAD' }), tileEnv);
  assert.equal(tileHead.status, 200);
  assert.equal(tileHead.body, null);
  assert.ok(tileHead.headers.get('ETag'));
  assertLongImmutableCache(tileHead);
  const rejected = await worker.fetch(request('/status', { method: 'POST' }), env);
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get('Allow'), 'GET, HEAD, OPTIONS');
});
});
