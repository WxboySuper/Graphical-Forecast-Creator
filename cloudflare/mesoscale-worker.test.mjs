import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './mesoscale-worker.mjs';

const ORIGIN = 'https://gfc.weatherboysuper.com';
const envFor = (objects = {}, overrides = {}) => ({
  MESOSCALE_BUCKET: {
    get: async (key) => {
      const value = objects[key];
      if (value === undefined) return null;
      return { json: async () => structuredClone(value), body: new Blob([JSON.stringify(value)]).stream(), httpEtag: '"obj-1"', httpMetadata: { contentType: key.endsWith('.png') ? 'image/png' : 'application/json' } };
    },
  },
  CORS_ALLOWED_ORIGINS: `${ORIGIN},https://staging-gfc.weatherboysuper.com,https://beta.gfcweather.com,http://localhost:3000,http://localhost:3002`,
  PUBLIC_BASE_URL: 'https://mesoscale.example.test',
  ...overrides,
});

const request = (path, options = {}) => new Request(`https://mesoscale.example.test${path}`, options);
const pointer = (modelId, cycleTime = '2026-11-08T12:00:00Z') => ({ schemaVersion: 1, modelId, cycleTime, catalogUrl: 'https://old.example/catalog.json', publishedAt: '2026-11-08T12:04:00Z' });
const withNow = async (timestamp, run) => {
  const originalNow = Date.now;
  Date.now = () => new Date(timestamp).getTime();
  try {
    return await run();
  } finally {
    Date.now = originalNow;
  }
};

const withCache = async (run) => {
  const originalCaches = globalThis.caches;
  const entries = new Map();
  const cache = {
    match: async (key) => entries.get(key.url)?.clone(),
    put: async (key, value) => { entries.set(key.url, value.clone()); },
  };
  globalThis.caches = { default: cache };
  try {
    return await run(cache);
  } finally {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
};

test('strictly whitelists route segments and rejects traversal attempts without R2 reads', async () => {
  let reads = 0;
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async () => { reads += 1; return null; } } });
  for (const path of [
    '/catalog/other/20261108T1200Z.json',
    '/catalog/hrrr/20261108T1200Z.json/extra',
    '/catalog/hrrr/%2e%2e.json',
    '/latest/../secret.json',
    '/latest/%2e%2e/secret.json',
    '/latest/hrrr%2Fsecret.json',
    '/tiles/hrrr/20261108T1200Z/f00/%2e%2e/3/0/0.png',
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/8/0.png',
    '/tiles/hrrr/20261108T1200Z/f00/temp/25/0/0.png',
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/0/0%2epng',
    '/tiles/hrrr/20261108T1200Z/f00/temp/3/0/0.png/extra',
  ]) {
    assert.equal((await worker.fetch(request(path), env)).status, 404, path);
  }
  assert.equal(reads, 0);
});

test('valid tile requests map only to the fixed v1 key namespace', async () => {
  let key;
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (requestedKey) => { key = requestedKey; return null; } } });
  assert.equal((await worker.fetch(request('/tiles/rrfs/20261108T1200Z/f03/temperature-2m/6/2/1.png'), env)).status, 404);
  assert.equal(key, 'mesoscale/v1/tiles/rrfs/20261108T1200Z/f03/temperature-2m/6/2/1.png');
});

test('CORS allows configured origins and omits permission for other origins', async () => {
  const env = envFor();
  const allowed = await worker.fetch(request('/latest/hrrr.json', { headers: { Origin: ORIGIN } }), env);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(allowed.headers.get('Vary'), /Origin/);
  const localBeta = await worker.fetch(request('/status', { headers: { Origin: 'http://localhost:3002' } }), env);
  assert.equal(localBeta.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3002');
  assert.match(localBeta.headers.get('Vary'), /Origin/);
  const denied = await worker.fetch(request('/latest/hrrr.json', { headers: { Origin: 'https://attacker.example' } }), env);
  assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  assert.match(denied.headers.get('Vary'), /Origin/);
  const noOrigin = await worker.fetch(request('/status'), env);
  assert.equal(noOrigin.headers.has('Access-Control-Allow-Origin'), false);
  assert.match(noOrigin.headers.get('Vary'), /Origin/);
  assert.equal((await noOrigin.json()).status, 'degraded');
  const preflight = await worker.fetch(request('/status', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, OPTIONS');
  const deniedPreflight = await worker.fetch(request('/status', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } }), env);
  assert.equal(deniedPreflight.status, 403);
  assert.match(deniedPreflight.headers.get('Vary'), /Origin/);
  const noOriginPreflight = await worker.fetch(request('/status', { method: 'OPTIONS' }), env);
  assert.equal(noOriginPreflight.status, 204);
  assert.equal(noOriginPreflight.headers.has('Access-Control-Allow-Origin'), false);
  assert.match(noOriginPreflight.headers.get('Vary'), /Origin/);
});

test('cycle catalog uses immutable caching, validates stored identity, and supports ETag 304', async () => {
  const cycleTime = '2026-11-08T12:00:00Z';
  const catalog = { schemaVersion: 1, model: { id: 'hrrr' }, cycleTime, status: 'complete', domain: { minZoom: 3, maxZoom: 6 }, frames: [{ forecastHour: 0, parameters: [{ id: 'temperature-2m', data: { type: 'xyz-raster', urlTemplate: 'https://old.example/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png' } }] }] };
  const env = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog });
  const response = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal((await response.json()).frames[0].parameters[0].data.urlTemplate, 'https://mesoscale.example.test/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png');
  const etag = response.headers.get('ETag');
  assert.notEqual(etag, '"obj-1"');
  const otherHostEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog }, { PUBLIC_BASE_URL: 'https://other-mesoscale.example.test' });
  const otherHostResponse = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), otherHostEnv);
  assert.notEqual(otherHostResponse.headers.get('ETag'), etag);
  const notModified = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': etag } }), env);
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get('ETag'), etag);
  const etagList = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': `"other", ${etag}` } }), env);
  assert.equal(etagList.status, 304);
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': etag.replace(/^W\//, '') } }), env)).status, 304);
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': '*' } }), env)).status, 304);
  const pathBaseEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog }, { PUBLIC_BASE_URL: 'https://mesoscale.example.test/catalog' });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), pathBaseEnv)).status, 503);
  const malformedFrame = { ...catalog, frames: [null] };
  const malformedFrameEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': malformedFrame });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), malformedFrameEnv)).status, 502);
  const mismatchedTemplate = structuredClone(catalog);
  mismatchedTemplate.frames[0].parameters[0].data.urlTemplate = 'https://old.example/tiles/rap/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png';
  const mismatchedTemplateEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': mismatchedTemplate });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), mismatchedTemplateEnv)).status, 502);
  const mismatchedCatalog = { ...catalog, model: { id: 'rap' } };
  const mismatchedCatalogEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': mismatchedCatalog });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), mismatchedCatalogEnv)).status, 502);
  const notReadCatalog = envFor({}, { MESOSCALE_BUCKET: { get: async () => ({ json: async () => { throw new Error('should not parse'); }, httpEtag: '"obj-1"' }) } });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': etag } }), notReadCatalog)).status, 304);
});

test('Cache API separates rewritten catalog representations by public base URL', async () => {
  await withCache(async () => {
    const catalog = { schemaVersion: 1, model: { id: 'hrrr' }, cycleTime: '2026-11-08T12:00:00Z', status: 'complete', domain: { minZoom: 3, maxZoom: 6 }, frames: [{ forecastHour: 0, parameters: [{ id: 'temperature-2m', data: { type: 'xyz-raster', urlTemplate: 'https://old.example/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png' } }] }] };
    const key = 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json';
    let reads = 0;
    const bucket = { get: async () => { reads += 1; return { json: async () => structuredClone(catalog), httpEtag: '"catalog"' }; } };
    const firstEnv = envFor({ [key]: catalog }, { MESOSCALE_BUCKET: bucket, PUBLIC_BASE_URL: 'https://first.example.test' });
    const secondEnv = envFor({ [key]: catalog }, { MESOSCALE_BUCKET: bucket, PUBLIC_BASE_URL: 'https://second.example.test' });
    const path = '/catalog/hrrr/20261108T1200Z.json';
    const first = await worker.fetch(request(path), firstEnv);
    const second = await worker.fetch(request(path), secondEnv);
    assert.match((await first.json()).frames[0].parameters[0].data.urlTemplate, /^https:\/\/first\.example\.test/);
    assert.match((await second.json()).frames[0].parameters[0].data.urlTemplate, /^https:\/\/second\.example\.test/);
    assert.equal(reads, 2);
  });
});

test('catalog and latest do not emit an ETag when R2 omits one', async () => {
  const catalog = { schemaVersion: 1, model: { id: 'hrrr' }, cycleTime: '2026-11-08T12:00:00Z', status: 'complete', domain: { minZoom: 3, maxZoom: 6 }, frames: [{ forecastHour: 0, parameters: [] }] };
  const pointerValue = pointer('hrrr');
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => {
    const value = key.includes('/catalog/') ? catalog : pointerValue;
    return { json: async () => structuredClone(value) };
  } } });
  const catalogResult = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env);
  const latestResult = await worker.fetch(request('/latest/hrrr.json'), env);
  assert.equal(catalogResult.headers.get('ETag'), null);
  assert.equal(latestResult.headers.get('ETag'), null);
});

test('missing tile is a short-cache 404 and missing latest pointer is also a 404', async () => {
  const env = envFor();
  const tile = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env);
  assert.equal(tile.status, 404);
  assert.equal(tile.headers.get('Cache-Control'), 'public, max-age=60');
  assert.equal((await worker.fetch(request('/latest/hrrr.json'), env)).status, 404);
});

test('tile response defaults to PNG content type when R2 metadata is absent', async () => {
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async () => ({ body: new Blob(['png']).stream(), size: 3, httpEtag: '"tile"' }) } });
  const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('Content-Length'), '3');
});

test('tile HEAD uses R2 metadata without reading the tile body', async () => {
  let heads = 0;
  let gets = 0;
  const env = envFor({}, { MESOSCALE_BUCKET: {
    head: async () => { heads += 1; return { size: 3, httpEtag: '"tile"' }; },
    get: async () => { gets += 1; throw new Error('HEAD must not read the object body'); },
  } });
  const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png', { method: 'HEAD' }), env);
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('Content-Length'), '3');
  assert.equal(heads, 1);
  assert.equal(gets, 0);
});

test('Cache API stores tiles, serves hits, honors conditional hits, and caches missing tiles', async () => {
  await withCache(async () => {
    const tileKey = 'mesoscale/v1/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png';
    const env = envFor({ [tileKey]: { pixels: 'tile' } });
    let reads = 0;
    const get = env.MESOSCALE_BUCKET.get;
    env.MESOSCALE_BUCKET.get = async (...args) => { reads += 1; return get(...args); };
    const path = '/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png';
    const first = await worker.fetch(request(path), env);
    assert.equal(first.status, 200);
    assert.equal(await first.text(), '{"pixels":"tile"}');
    const etag = first.headers.get('ETag');
    assert.equal(first.headers.get('Content-Type'), 'image/png');
    assert.equal(first.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    assert.equal(first.headers.get('X-Content-Type-Options'), 'nosniff');
    const hit = await worker.fetch(request(path), env);
    assert.equal(hit.status, 200);
    assert.equal(reads, 1);
    assert.equal((await worker.fetch(request(`${path}?cacheBust=1`), env)).status, 200);
    assert.equal(reads, 1);
    const conditionalHit = await worker.fetch(request(path, { headers: { 'If-None-Match': etag } }), env);
    assert.equal(conditionalHit.status, 304);
    assert.equal(reads, 1);
    const head = await worker.fetch(request(path, { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(reads, 1);

    const missingPath = '/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/1/1.png';
    assert.equal((await worker.fetch(request(missingPath), env)).status, 404);
    assert.equal((await worker.fetch(request(missingPath), env)).status, 404);
    assert.equal(reads, 2);
  });
});

test('cache read failure falls back to R2 and put uses waitUntil when available', async () => {
  await withCache(async (cache) => {
    cache.match = async () => { throw new Error('cache unavailable'); };
    const tileKey = 'mesoscale/v1/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png';
    let reads = 0;
    const env = envFor({ [tileKey]: { pixels: 'tile' } });
    const get = env.MESOSCALE_BUCKET.get;
    env.MESOSCALE_BUCKET.get = async (...args) => { reads += 1; return get(...args); };
    const tasks = [];
    const response = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env, { waitUntil: (task) => tasks.push(task) });
    assert.equal(response.status, 200);
    assert.equal(reads, 1);
    assert.equal(tasks.length, 0);
    cache.match = async () => undefined;
    const cachedWriteResponse = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png?miss=1'), env, { waitUntil: (task) => tasks.push(task) });
    assert.equal(cachedWriteResponse.status, 200);
    assert.equal(reads, 2);
    assert.equal(tasks.length, 1);
    await Promise.all(tasks);
  });
});

test('latest pointer reports live age and stale state without changing its cycle identity', async () => {
  const env = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') }, { STALE_AFTER_MINUTES: '60' });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/latest/hrrr.json'), env);
    const value = await response.json();
    assert.equal(value.cycleTime, '2026-11-08T12:00:00Z');
    assert.equal(value.catalogUrl, 'https://mesoscale.example.test/catalog/hrrr/20261108T1200Z.json');
    assert.equal(response.headers.get('X-Mesoscale-Stale'), 'true');
    assert.equal(Number(response.headers.get('X-Mesoscale-Age-Minutes')) > 60, true);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30');
    const notModified = await worker.fetch(request('/latest/hrrr.json', { headers: { 'If-None-Match': response.headers.get('ETag') } }), env);
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get('X-Mesoscale-Stale'), 'true');
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

test('status aggregates latest pointers and current or previous daily health records', async () => {
  const env = envFor({
    'mesoscale/v1/latest/hrrr.json': pointer('hrrr'),
    'mesoscale/v1/latest/rap.json': pointer('rap'),
    'mesoscale/v1/health/2026-11-08/hrrr.json': { schemaVersion: 1, modelId: 'hrrr', status: 'complete', generatedAt: '2026-11-08T12:10:00Z' },
    'mesoscale/v1/health/2026-11-07/rap.json': { schemaVersion: 1, modelId: 'rap', status: 'partial', generatedAt: '2026-11-07T23:10:00Z' },
  });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/status'), env);
    const body = await response.json();
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30');
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

test('malformed catalog and pointer JSON produce explicit gateway errors', async () => {
  const malformed = { json: async () => { throw new SyntaxError('invalid'); }, httpEtag: '"bad"' };
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async () => malformed } });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env)).status, 502);
  assert.equal((await worker.fetch(request('/latest/hrrr.json'), env)).status, 502);
});

test('status labels malformed pointer JSON as invalid instead of missing', async () => {
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => key === 'mesoscale/v1/latest/hrrr.json' ? { json: async () => { throw new SyntaxError('invalid'); } } : null } });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/status'), env);
    const body = await response.json();
    assert.equal(body.models.find((model) => model.modelId === 'hrrr').health, 'invalid');
  });
});

test('status labels parsed records with missing required fields as invalid', async () => {
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async (key) => {
    if (key === 'mesoscale/v1/latest/hrrr.json') return { json: async () => ({ schemaVersion: 1, modelId: 'rap', cycleTime: '2026-11-08T12:00:00Z' }) };
    if (key === 'mesoscale/v1/health/2026-11-08/hrrr.json') return { json: async () => ({ schemaVersion: 1, modelId: 'hrrr', generatedAt: '2026-11-08T15:00:00Z' }) };
    return null;
  } } });
  await withNow('2026-11-08T15:01:00Z', async () => {
    const response = await worker.fetch(request('/status'), env);
    const model = (await response.json()).models.find((item) => item.modelId === 'hrrr');
    assert.equal(model.latestCycleTime, null);
    assert.equal(model.health, 'invalid');
  });
});

test('status degrades on R2 read errors and rejects unsupported health states', async () => {
  const env = envFor({}, {
    MESOSCALE_BUCKET: { get: async (key) => {
      if (key === 'mesoscale/v1/health/2026-11-08/hrrr.json') return { json: async () => ({ schemaVersion: 1, modelId: 'hrrr', generatedAt: '2026-11-08T13:00:00Z', status: 'mystery' }) };
      if (key === 'mesoscale/v1/latest/hrrr.json' || key === 'mesoscale/v1/health/2026-11-07/hrrr.json') throw new Error('temporary R2 read failure');
      return null;
    } },
  });
  const response = await withNow('2026-11-08T15:00:00Z', () => worker.fetch(request('/status'), env));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.status, 'degraded');
  assert.equal(value.models.find((model) => model.modelId === 'hrrr').health, 'invalid');
});

test('HEAD returns headers without a body, and unsupported methods return 405', async () => {
  const env = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') }, { STALE_AFTER_MINUTES: '1' });
  await withNow('2026-11-08T15:00:00Z', async () => {
    const head = await worker.fetch(request('/latest/hrrr.json', { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(head.headers.get('X-Mesoscale-Stale'), 'true');
  });
  const catalog = { schemaVersion: 1, model: { id: 'hrrr' }, cycleTime: '2026-11-08T12:00:00Z', status: 'complete', domain: { minZoom: 3, maxZoom: 6 }, frames: [{ forecastHour: 0, parameters: [] }] };
  const catalogEnv = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog });
  const catalogHead = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { method: 'HEAD' }), catalogEnv);
  assert.equal(catalogHead.status, 200);
  assert.equal(catalogHead.body, null);
  assert.ok(catalogHead.headers.get('ETag'));
  assert.equal(catalogHead.headers.get('Content-Type'), 'application/json');
  const tileEnv = envFor({}, { MESOSCALE_BUCKET: { head: async () => ({ size: 3, httpEtag: '"tile"' }) } });
  const tileHead = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png', { method: 'HEAD' }), tileEnv);
  assert.equal(tileHead.status, 200);
  assert.equal(tileHead.body, null);
  assert.equal(tileHead.headers.get('ETag'), '"tile"');
  assert.equal(tileHead.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  const rejected = await worker.fetch(request('/status', { method: 'POST' }), env);
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get('Allow'), 'GET, HEAD, OPTIONS');
});
