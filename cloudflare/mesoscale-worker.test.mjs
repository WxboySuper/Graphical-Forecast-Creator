import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './mesoscale-worker.mjs';

const ORIGIN = 'https://gfc.weatherboysuper.com';
const envFor = (objects = {}, overrides = {}) => ({
  MESOSCALE_BUCKET: {
    get: async (key) => {
      const value = objects[key];
      if (value === undefined) return null;
      if (value instanceof Response) return { body: value.body, json: () => value.json(), httpEtag: '"obj-1"', httpMetadata: { contentType: 'application/json' } };
      return { json: async () => structuredClone(value), body: new Blob([JSON.stringify(value)]).stream(), httpEtag: '"obj-1"', httpMetadata: { contentType: key.endsWith('.png') ? 'image/png' : 'application/json' } };
    },
  },
  CORS_ALLOWED_ORIGINS: `${ORIGIN},https://staging-gfc.weatherboysuper.com,https://beta.gfcweather.com,http://localhost:3000,http://localhost:3002`,
  PUBLIC_BASE_URL: 'https://mesoscale.example.test',
  ...overrides,
});

const request = (path, options = {}) => new Request(`https://mesoscale.example.test${path}`, options);
const pointer = (modelId, cycleTime = '2026-11-08T12:00:00Z') => ({ schemaVersion: 1, modelId, cycleTime, catalogUrl: 'https://old.example/catalog.json', publishedAt: '2026-11-08T12:04:00Z' });

test('strictly whitelists route segments and rejects traversal attempts without R2 reads', async () => {
  let reads = 0;
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async () => { reads += 1; return null; } } });
  for (const path of [
    '/catalog/other/20261108T1200Z.json',
    '/catalog/hrrr/20261108T1200Z.json/extra',
    '/catalog/hrrr/%2e%2e.json',
    '/latest/../secret.json',
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
  const denied = await worker.fetch(request('/latest/hrrr.json', { headers: { Origin: 'https://attacker.example' } }), env);
  assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  const preflight = await worker.fetch(request('/status', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, OPTIONS');
  assert.equal((await worker.fetch(request('/status', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } }), env)).status, 403);
});

test('cycle catalog uses immutable caching, validates stored identity, and supports ETag 304', async () => {
  const cycleTime = '2026-11-08T12:00:00Z';
  const catalog = { schemaVersion: 1, model: { id: 'hrrr' }, cycleTime, status: 'complete', domain: { minZoom: 3, maxZoom: 6 }, frames: [{ parameters: [{ data: { type: 'xyz-raster', urlTemplate: 'https://old.example/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png' } }] }] };
  const env = envFor({ 'mesoscale/v1/catalog/hrrr/20261108T1200Z.json': catalog });
  const response = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal((await response.json()).frames[0].parameters[0].data.urlTemplate, 'https://mesoscale.example.test/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png');
  const notModified = await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': '"obj-1"' } }), env);
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get('ETag'), '"obj-1"');
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': 'W/"obj-1"' } }), env)).status, 304);
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json', { headers: { 'If-None-Match': '*' } }), env)).status, 304);
});

test('missing tile is a short-cache 404 and missing latest pointer is also a 404', async () => {
  const env = envFor();
  const tile = await worker.fetch(request('/tiles/hrrr/20261108T1200Z/f00/temperature-2m/3/0/0.png'), env);
  assert.equal(tile.status, 404);
  assert.equal(tile.headers.get('Cache-Control'), 'public, max-age=60');
  assert.equal((await worker.fetch(request('/latest/hrrr.json'), env)).status, 404);
});

test('latest pointer reports live age and stale state without changing its cycle identity', async () => {
  const env = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') }, { STALE_AFTER_MINUTES: '60' });
  const response = await worker.fetch(request('/latest/hrrr.json'), env);
  const value = await response.json();
  assert.equal(value.cycleTime, '2026-11-08T12:00:00Z');
  assert.equal(value.catalogUrl, 'https://mesoscale.example.test/catalog/hrrr/20261108T1200Z.json');
  assert.equal(response.headers.get('X-Mesoscale-Stale'), 'true');
  assert.equal(Number(response.headers.get('X-Mesoscale-Age-Minutes')) > 60, true);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30');
  const notModified = await worker.fetch(request('/latest/hrrr.json', { headers: { 'If-None-Match': '"obj-1"' } }), env);
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get('X-Mesoscale-Stale'), 'true');
});

test('status aggregates latest pointers and current or previous daily health records', async () => {
  const env = envFor({
    'mesoscale/v1/latest/hrrr.json': pointer('hrrr'),
    'mesoscale/v1/latest/rap.json': pointer('rap'),
    'mesoscale/v1/health/2026-11-08/hrrr.json': { modelId: 'hrrr', status: 'complete', generatedAt: '2026-11-08T12:10:00Z' },
    'mesoscale/v1/health/2026-11-07/rap.json': { modelId: 'rap', status: 'partial', generatedAt: '2026-11-07T23:10:00Z' },
  });
  const response = await worker.fetch(request('/status'), env);
  const body = await response.json();
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30');
  assert.equal(body.models.length, 3);
  assert.equal(body.models.find((item) => item.modelId === 'hrrr').health, 'complete');
  assert.equal(body.models.find((item) => item.modelId === 'rap').health, 'partial');
  assert.equal(body.models.find((item) => item.modelId === 'rrfs').health, 'missing');
  assert.equal(body.status, 'degraded');
});

test('malformed catalog and pointer JSON produce explicit gateway errors', async () => {
  const malformed = { json: async () => { throw new SyntaxError('invalid'); }, httpEtag: '"bad"' };
  const env = envFor({}, { MESOSCALE_BUCKET: { get: async () => malformed } });
  assert.equal((await worker.fetch(request('/catalog/hrrr/20261108T1200Z.json'), env)).status, 502);
  assert.equal((await worker.fetch(request('/latest/hrrr.json'), env)).status, 502);
});

test('HEAD returns headers without a body, and unsupported methods return 405', async () => {
  const env = envFor({ 'mesoscale/v1/latest/hrrr.json': pointer('hrrr') });
  const head = await worker.fetch(request('/latest/hrrr.json', { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get('X-Mesoscale-Stale'), 'true');
  const rejected = await worker.fetch(request('/status', { method: 'POST' }), env);
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get('Allow'), 'GET, HEAD, OPTIONS');
});
