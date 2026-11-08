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

const gzipBytes = async (value) => new Uint8Array(await new Response(
  new Blob([value]).stream().pipeThrough(new CompressionStream('gzip')),
).arrayBuffer());

const fixtureLeaf = async ({ bytes, leaf, gzip }) => {
  let leafBytes = leaf ? directory({ length: bytes.length }) : null;
  if (gzip && leafBytes) leafBytes = await gzipBytes(leafBytes);
  return leafBytes;
};

export const createPmtilesFixture = async ({ bytes = Uint8Array.from([137, 80, 78]), leaf = false, gzip = false, tileLength = bytes.length } = {}) => {
  const leafBytes = await fixtureLeaf({ bytes, leaf, gzip });
  let root = leaf ? directory({ runLength: 0, length: leafBytes.length }) : directory({ length: tileLength });
  if (gzip) root = await gzipBytes(root);
  const rootOffset = 127;
  const leafOffset = rootOffset + root.length;
  const tileOffset = leaf ? leafOffset + leafBytes.length : rootOffset + root.length;
  const archive = new Uint8Array(tileOffset + bytes.length);
  archive.set(new TextEncoder().encode('PMTiles'), 0);
  archive[7] = 3;
  const view = new DataView(archive.buffer);
  const put64 = (offset, value) => view.setBigUint64(offset, BigInt(value), true);
  put64(8, rootOffset); put64(16, root.length);
  put64(40, leaf ? leafOffset : 0); put64(48, leaf ? leafBytes.length : 0);
  put64(56, tileOffset); put64(64, bytes.length);
  archive[97] = gzip ? 2 : 1; archive[98] = 1; archive[99] = 2; archive[100] = 3; archive[101] = 4;
  view.setInt32(102, -1300000000, true); view.setInt32(106, 200000000, true);
  view.setInt32(110, -600000000, true); view.setInt32(114, 550000000, true);
  archive.set(root, rootOffset);
  if (leafBytes) archive.set(leafBytes, leafOffset);
  archive.set(bytes, tileOffset);
  return archive;
};

export const rangeBucket = (archive, { failAt = null, etag = 'archive-v1', partialFirstRange = false } = {}) => {
  const reads = [];
  return {
    reads,
    async get(key, options = {}) {
      reads.push({ key, range: options.range });
      if (failAt === reads.length) throw new Error('range failed');
      if (key !== 'mesoscale/v1/archives/hrrr/20261108T1200Z/f00/temperature-2m.pmtiles') return null;
      if (!options.range) throw new Error('range required');
      const { offset, length } = options.range;
      if (offset < 0 || offset >= archive.length) return null;
      if (offset + length > archive.length && !(partialFirstRange && offset === 0)) return null;
      const part = archive.slice(offset, offset + length);
      return { size: archive.length, httpEtag: etag, arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) };
    },
  };
};

export const encodeVarintForTest = varint;
