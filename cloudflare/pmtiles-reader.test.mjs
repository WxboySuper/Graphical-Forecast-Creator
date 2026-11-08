import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPmtilesCacheForTests, decodeDirectory, parseHeader, PmtilesError, readTile } from './pmtiles-reader.mjs';
import { createPmtilesFixture, encodeVarintForTest, rangeBucket } from './pmtiles-fixture.test-helper.mjs';

const KEY = 'mesoscale/v1/archives/hrrr/20261108T1200Z/f00/temperature-2m.pmtiles';
const read = (bucket, overrides = {}) => readTile({ bucket, key: KEY, zoom: 3, x: 0, y: 0, minZoom: 3, maxZoom: 4, ...overrides });

test('parses the v3 header and delta encoded root directory', async () => {
  clearPmtilesCacheForTests();
  const archive = await createPmtilesFixture();
  assert.equal(parseHeader(archive.slice(0, 127)).tileType, 2);
  assert.equal(decodeDirectory(Uint8Array.from([1, 21, 1, 3, 1]))[0].tileId, 21);
  assert.equal((await read(rangeBucket(archive))).state, 'found');
});

test('reads leaf directories and gzip compressed directory bytes', async () => {
  for (const options of [{ leaf: true }, { gzip: true }, { leaf: true, gzip: true }]) {
    clearPmtilesCacheForTests();
    const archive = await createPmtilesFixture(options);
    assert.equal((await read(rangeBucket(archive))).state, 'found');
  }
});

test('returns missing tile and out of zoom without reading tile payload', async () => {
  clearPmtilesCacheForTests();
  const archive = await createPmtilesFixture();
  const bucket = rangeBucket(archive);
  assert.equal((await read(bucket, { x: 1, y: 1 })).state, 'missing-tile');
  assert.equal((await read(bucket, { zoom: 5, x: 0, y: 0 })).state, 'out-of-zoom');
  assert.equal((await read(bucket, { x: 8, y: 0 })).state, 'missing-tile');
  assert.equal((await read(bucket, { x: -1, y: 0 })).state, 'missing-tile');
});

test('rejects truncated, corrupt, and unsupported archive data', async () => {
  clearPmtilesCacheForTests();
  const truncated = rangeBucket(Uint8Array.from([1, 2, 3]), { partialFirstRange: true });
  await assert.rejects(() => read(truncated), PmtilesError);
  clearPmtilesCacheForTests();
  const corrupt = await createPmtilesFixture();
  corrupt[0] = 0;
  await assert.rejects(() => read(rangeBucket(corrupt)), PmtilesError);
  clearPmtilesCacheForTests();
  const overlappingMetadata = await createPmtilesFixture();
  new DataView(overlappingMetadata.buffer).setBigUint64(24, 127n, true);
  await assert.rejects(() => read(rangeBucket(overlappingMetadata)), /metadata range/);
  assert.throws(() => decodeDirectory(Uint8Array.from([...Array(10).fill(0x80)])), PmtilesError);
});

test('turns range read failures into safe PMTiles errors', async () => {
  clearPmtilesCacheForTests();
  const bucket = rangeBucket(await createPmtilesFixture(), { failAt: 2 });
  await assert.rejects(() => read(bucket), PmtilesError);
});

test('rejects oversized tile ranges before reading tile bytes', async () => {
  clearPmtilesCacheForTests();
  const bucket = rangeBucket(await createPmtilesFixture({ tileLength: 9 * 1024 * 1024 }));
  await assert.rejects(() => read(bucket), /tile entry is too large/);
  assert.equal(bucket.reads.length, 2);
});

test('caches parsed archive data so warm tiles need one range read', async () => {
  clearPmtilesCacheForTests();
  const bucket = rangeBucket(await createPmtilesFixture());
  assert.equal((await read(bucket)).state, 'found');
  const coldReads = bucket.reads.length;
  assert.ok(coldReads >= 3);
  assert.equal((await read(bucket, { x: 0, y: 0 })).state, 'found');
  assert.equal(bucket.reads.length, coldReads + 1);
});

test('rejects a malformed directory varint', () => {
  assert.throws(() => decodeDirectory(Uint8Array.from([1, ...encodeVarintForTest(21), 1, 3, ...Array(9).fill(0x80)])), PmtilesError);
});
