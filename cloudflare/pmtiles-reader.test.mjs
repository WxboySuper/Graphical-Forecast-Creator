import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPmtilesCacheForTests, decodeDirectory, findDirectoryEntry, parseHeader, PmtilesError, readTile } from './pmtiles-reader.mjs';
import { validateDirectoryOrdering } from './pmtiles-directory-validation.mjs';
import { createPmtilesFixture, encodeVarintForTest, FIXTURE_ARCHIVE_KEY, rangeBucket } from './pmtiles-fixture.test-helper.mjs';

const KEY = FIXTURE_ARCHIVE_KEY;
const read = (bucket, overrides = {}) => readTile({ bucket, key: KEY, zoom: 3, x: 0, y: 0, minZoom: 3, maxZoom: 4, ...overrides });

test('parses the v3 header and delta encoded root directory', async () => {
  clearPmtilesCacheForTests();
  const archive = await createPmtilesFixture();
  assert.equal(parseHeader(archive.slice(0, 127)).tileType, 2);
  assert.equal(decodeDirectory(Uint8Array.from([1, 21, 1, 3, 1]))[0].tileId, 21);
  assert.equal((await read(rangeBucket(archive))).state, 'found');
  const oversizedRootHeader = archive.slice(0, 127);
  new DataView(oversizedRootHeader.buffer).setBigUint64(16, 16_258n, true);
  assert.throws(() => parseHeader(oversizedRootHeader), /root directory range/);
});

test('PMTiles fixture rejects zoom values outside the header byte range', async () => {
  await assert.rejects(createPmtilesFixture({ maxZoom: 256 }), /maxZoom must be a byte value/);
  await assert.rejects(createPmtilesFixture({ minZoom: -1 }), /minZoom must be a byte value/);
});

test('PMTiles header enforces supported zoom intervals', async () => {
  const zoomFive = await createPmtilesFixture({ minZoom: 3, maxZoom: 5 });
  assert.equal(parseHeader(zoomFive.slice(0, 127)).maxZoom, 5);

  const overMaximum = await createPmtilesFixture({ minZoom: 3, maxZoom: 25 });
  assert.throws(() => parseHeader(overMaximum.slice(0, 127)), /maximum zoom/);

  const overMinimum = await createPmtilesFixture({ minZoom: 25, maxZoom: 25 });
  assert.throws(() => parseHeader(overMinimum.slice(0, 127)), /minimum zoom/);

  const inverted = await createPmtilesFixture({ minZoom: 5, maxZoom: 3 });
  assert.throws(() => parseHeader(inverted.slice(0, 127)), /zoom interval/);
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
  assert.equal((await read(bucket, { zoom: 3.5, x: 0, y: 0 })).state, 'out-of-zoom');
  assert.equal((await read(bucket, { x: 8, y: 0 })).state, 'missing-tile');
  assert.equal((await read(bucket, { x: -1, y: 0 })).state, 'missing-tile');
});

test('head-only reads return metadata without fetching tile bytes', async () => {
  clearPmtilesCacheForTests();
  const bucket = rangeBucket(await createPmtilesFixture());
  const tile = await read(bucket, { headOnly: true });
  assert.equal(tile.state, 'found');
  assert.equal(tile.length, 3);
  assert.equal(tile.bytes, undefined);
  assert.equal(bucket.reads.length, 3);
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

test('rejects cached offsets when an immutable archive key changes', async () => {
  clearPmtilesCacheForTests();
  const original = await createPmtilesFixture();
  const bucket = rangeBucket(original, { etag: 'archive-v1' });
  assert.equal((await read(bucket)).state, 'found');
  const changed = rangeBucket(await createPmtilesFixture({ bytes: Uint8Array.from([1, 2, 3]) }), { etag: 'archive-v2' });
  const combined = {
    async get(key, options) {
      return changed.get(key, options);
    },
  };
  await assert.rejects(() => read(combined, { zoom: 4 }), /archive changed/);
  assert.equal((await read(combined)).state, 'found');
});

test('requires R2 identity metadata before caching an archive', async () => {
  clearPmtilesCacheForTests();
  const bucket = rangeBucket(await createPmtilesFixture(), { etag: null });
  await assert.rejects(() => read(bucket), /archive identity is unavailable/);
});

test('rejects unsupported directory compression values', async () => {
  const { decompressDirectory } = await import('./pmtiles-compression.mjs');
  await assert.rejects(() => decompressDirectory(new Uint8Array(), 3), /Unsupported PMTiles directory compression/);
});

test('rejects a malformed directory varint', () => {
  assert.throws(() => decodeDirectory(Uint8Array.from([0])), /entry count/);
  assert.throws(() => decodeDirectory(Uint8Array.from([1, ...encodeVarintForTest(21), 1, 3, ...Array(9).fill(0x80)])), PmtilesError);
  assert.throws(() => decodeDirectory(Uint8Array.from([2, 21, 0, 1, 1, 3, 3, 1, 0])), /not ordered/);
  assert.throws(() => validateDirectoryOrdering({ tileIds: [1, 2], runs: [Number.MAX_SAFE_INTEGER, 1] }), /tile id range/);
});

test('binary search finds the predecessor directory entry and its tile run', () => {
  const entries = [
    { tileId: 1, runLength: 2 },
    { tileId: 4, runLength: 1 },
    { tileId: 7, runLength: 3 },
  ];
  assert.equal(findDirectoryEntry(entries, 4), entries[1]);
  assert.equal(findDirectoryEntry(entries, 5), null);
  assert.equal(findDirectoryEntry(entries, 9), entries[2]);
  assert.equal(findDirectoryEntry(entries, 10), null);
});
