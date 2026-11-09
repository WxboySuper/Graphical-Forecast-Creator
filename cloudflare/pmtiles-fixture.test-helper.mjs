import { PUBLISHED_TILE_CONTRACT } from './pmtiles-contract.mjs';

const varint = (value) => {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return bytes;
};

const directory = ({ tileId = 21, runLength = 1, length = 3, offset = 0 } = {}) => Uint8Array.from([
  ...varint(1), ...varint(tileId), ...varint(runLength), ...varint(length), ...varint(offset + 1),
]);

export const FIXTURE_ARCHIVE_KEY = 'mesoscale/v1/archives/hrrr/20261108T1200Z/f00/temperature-2m.pmtiles';

const gzipBytes = async (value) => new Uint8Array(await new Response(
  new Blob([value]).stream().pipeThrough(new CompressionStream('gzip')),
).arrayBuffer());

const fixtureLeaf = async ({ bytes, leaf, gzip }) => {
  let leafBytes = leaf ? directory({ length: bytes.length }) : null;
  if (gzip && leafBytes) leafBytes = await gzipBytes(leafBytes);
  return leafBytes;
};

export const createPmtilesFixture = async ({ bytes = Uint8Array.from([137, 80, 78]), leaf = false, gzip = false, tileLength = bytes.length, maxZoom = 4 } = {}) => {
  const leafBytes = await fixtureLeaf({ bytes, leaf, gzip });
  let root = leaf ? directory({ runLength: 0, length: leafBytes.length }) : directory({ length: tileLength });
  if (gzip) root = await gzipBytes(root);
  let metadata = new TextEncoder().encode('{}');
  if (gzip) metadata = await gzipBytes(metadata);
  const rootOffset = 127;
  const metadataOffset = rootOffset + root.length;
  const leafOffset = metadataOffset + metadata.length;
  const tileOffset = leaf ? leafOffset + leafBytes.length : leafOffset;
  const archive = new Uint8Array(tileOffset + bytes.length);
  archive.set(new TextEncoder().encode('PMTiles'), 0);
  archive[7] = 3;
  const view = new DataView(archive.buffer);
  const put64 = (offset, value) => view.setBigUint64(offset, BigInt(value), true);
  put64(8, rootOffset); put64(16, root.length);
  put64(24, metadataOffset); put64(32, metadata.length);
  put64(40, leaf ? leafOffset : 0); put64(48, leaf ? leafBytes.length : 0);
  put64(56, tileOffset); put64(64, bytes.length);
  archive[97] = gzip ? 2 : 1; archive[98] = 1; archive[99] = 2;
  archive[100] = PUBLISHED_TILE_CONTRACT.minZoom; archive[101] = maxZoom;
  view.setInt32(102, PUBLISHED_TILE_CONTRACT.minLonE7, true); view.setInt32(106, PUBLISHED_TILE_CONTRACT.minLatE7, true);
  view.setInt32(110, PUBLISHED_TILE_CONTRACT.maxLonE7, true); view.setInt32(114, PUBLISHED_TILE_CONTRACT.maxLatE7, true);
  archive.set(root, rootOffset);
  archive.set(metadata, metadataOffset);
  if (leafBytes) archive.set(leafBytes, leafOffset);
  archive.set(bytes, tileOffset);
  return archive;
};

const validRangeForFixture = ({ archive, offset, length, partialFirstRange }) => {
  if (offset < 0 || offset >= archive.length) return false;
  if (offset + length <= archive.length) return true;
  return partialFirstRange && offset === 0;
};

const partForFixture = (archive, { offset, length }, etag) => {
  const part = archive.slice(offset, offset + length);
  return {
    size: archive.length,
    httpEtag: etag,
    arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength),
  };
};

export const rangeBucket = (archive, { archiveKey = FIXTURE_ARCHIVE_KEY, failAt = null, etag = 'archive-v1', partialFirstRange = false } = {}) => {
  const reads = [];
  return {
    reads,
    async get(key, options = {}) {
      reads.push({ key, range: options.range });
      if (failAt === reads.length) throw new Error('range failed');
      if (key !== archiveKey) return null;
      if (!options.range) throw new Error('range required');
      if (!validRangeForFixture({ archive, ...options.range, partialFirstRange })) return null;
      return partForFixture(archive, { ...options.range }, etag);
    },
  };
};

export const encodeVarintForTest = varint;
