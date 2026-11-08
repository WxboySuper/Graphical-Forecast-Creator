const HEADER_BYTES = 127;
const PNG_TILE_TYPE = 2;
const NO_COMPRESSION = 1;
const GZIP_COMPRESSION = 2;
const MAX_ARCHIVES = 8;
const MAX_DIRECTORIES = 4;
const MAX_DIRECTORY_BYTES = 2 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 10000;
const MAX_TILE_BYTES = 8 * 1024 * 1024;

const archives = new Map();

export class PmtilesError extends Error {}

const readVarint = (bytes, cursor) => {
  let value = 0;
  let shift = 0;
  while (cursor.offset < bytes.length && shift <= 49) {
    const byte = bytes[cursor.offset++];
    value += (byte & 0x7f) * (2 ** shift);
    if (!Number.isSafeInteger(value)) throw new PmtilesError('PMTiles varint exceeds safe range');
    if (!(byte & 0x80)) return value;
    shift += 7;
  }
  throw new PmtilesError('Invalid PMTiles directory varint');
};

const uint64 = (view, offset) => {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new PmtilesError('PMTiles offset exceeds safe range');
  return Number(value);
};

const safeEnd = (offset, length, message) => {
  const end = offset + length;
  if (!Number.isSafeInteger(end)) throw new PmtilesError(message);
  return end;
};

const matchesPublishedBounds = (header) => {
  if (header.minLon !== -1300000000) return false;
  if (header.minLat !== 200000000) return false;
  if (header.maxLon !== -600000000) return false;
  return header.maxLat === 550000000;
};

const headerFromBytes = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.slice(0, 7)) !== 'PMTiles' || bytes[7] !== 3) throw new PmtilesError('Unsupported PMTiles archive');
  return {
    rootOffset: uint64(view, 8), rootLength: uint64(view, 16), metadataOffset: uint64(view, 24), metadataLength: uint64(view, 32),
    leafOffset: uint64(view, 40), leafLength: uint64(view, 48),
    tileOffset: uint64(view, 56), tileLength: uint64(view, 64), internalCompression: bytes[97],
    tileCompression: bytes[98], tileType: bytes[99], minZoom: bytes[100], maxZoom: bytes[101],
    minLon: view.getInt32(102, true), minLat: view.getInt32(106, true), maxLon: view.getInt32(110, true), maxLat: view.getInt32(114, true),
  };
};

const validateTileFormat = (header) => {
  if (header.tileType !== PNG_TILE_TYPE || header.tileCompression !== NO_COMPRESSION) throw new PmtilesError('PMTiles archive is not uncompressed PNG');
};

const validateHeaderCompression = (header) => {
  if (![NO_COMPRESSION, GZIP_COMPRESSION].includes(header.internalCompression)) throw new PmtilesError('Unsupported PMTiles directory compression');
};

const validateHeaderZoom = (header) => {
  if (header.minZoom !== 3 || header.maxZoom !== 4) throw new PmtilesError('PMTiles zoom interval does not match the published contract');
};

const validTileCoordinate = ({ zoom, x, y }) => {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0) return false;
  if (x >= 2 ** zoom) return false;
  return y < 2 ** zoom;
};

const validateHeaderBounds = (header) => {
  if (!matchesPublishedBounds(header)) throw new PmtilesError('PMTiles bounds do not match the published contract');
};

const validateHeaderRoot = (header) => {
  if (!header.rootLength || header.rootLength > MAX_DIRECTORY_BYTES) throw new PmtilesError('Invalid PMTiles root directory range');
};

const validateHeader = (header) => {
  validateTileFormat(header);
  validateHeaderCompression(header);
  validateHeaderZoom(header);
  validateHeaderBounds(header);
  validateHeaderRoot(header);
};

export const parseHeader = (bytes) => {
  if (bytes.byteLength !== HEADER_BYTES) throw new PmtilesError('Invalid PMTiles header length');
  const header = headerFromBytes(bytes);
  validateHeader(header);
  return header;
};

const readDirectoryColumns = (bytes, cursor, count) => {
  const tileIds = [];
  let lastId = 0;
  for (let index = 0; index < count; index += 1) {
    lastId += readVarint(bytes, cursor);
    tileIds.push(lastId);
  }
  const runs = Array.from({ length: count }, () => readVarint(bytes, cursor));
  const lengths = Array.from({ length: count }, () => readVarint(bytes, cursor));
  return { tileIds, runs, lengths };
};

const directoryEntries = (bytes, cursor, columns) => {
  const entries = [];
  let lastOffset = 0;
  let lastLength = 0;
  for (let index = 0; index < columns.tileIds.length; index += 1) {
    const encodedOffset = readVarint(bytes, cursor);
    const offset = encodedOffset === 0 ? lastOffset + lastLength : encodedOffset - 1;
    const length = columns.lengths[index];
    if (length <= 0) throw new PmtilesError('Invalid PMTiles directory entry length');
    if (!Number.isSafeInteger(offset + length)) throw new PmtilesError('Invalid PMTiles directory byte range');
    if (!Number.isSafeInteger(columns.tileIds[index] + columns.runs[index])) throw new PmtilesError('Invalid PMTiles tile id range');
    entries.push({ tileId: columns.tileIds[index], runLength: columns.runs[index], offset, length });
    lastOffset = offset;
    lastLength = length;
  }
  return entries;
};

export const decodeDirectory = (bytes) => {
  const cursor = { offset: 0 };
  const count = readVarint(bytes, cursor);
  if (!Number.isSafeInteger(count) || count > MAX_DIRECTORY_ENTRIES) throw new PmtilesError('Invalid PMTiles directory entry count');
  const entries = directoryEntries(bytes, cursor, readDirectoryColumns(bytes, cursor, count));
  if (cursor.offset !== bytes.length) throw new PmtilesError('Trailing PMTiles directory data');
  return entries;
};

const joinChunks = (chunks, length) => {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

const decompressDirectory = async (bytes, compression) => {
  if (compression === NO_COMPRESSION) return bytes;
  let reader;
  try {
    reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > MAX_DIRECTORY_BYTES) throw new PmtilesError('PMTiles directory is too large');
      chunks.push(result.value);
    }
    return joinChunks(chunks, length);
  } catch (error) {
    try { await reader?.cancel(); } catch { /* Release a failed gzip stream. */ }
    if (error instanceof PmtilesError) throw error;
    throw new PmtilesError('Invalid compressed PMTiles directory');
  } finally {
    reader?.releaseLock();
  }
};

const hilbertDistance = (zoom, x, y) => {
  let distance = 0;
  for (let scale = 2 ** (zoom - 1); scale > 0; scale = Math.floor(scale / 2)) {
    const rx = (x & scale) > 0 ? 1 : 0;
    const ry = (y & scale) > 0 ? 1 : 0;
    distance += scale * scale * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        x = (2 ** zoom - 1) - x;
        y = (2 ** zoom - 1) - y;
      }
      [x, y] = [y, x];
    }
  }
  return ((4 ** zoom - 1) / 3) + distance;
};

const cacheArchive = (key, state) => {
  archives.delete(key);
  archives.set(key, state);
  while (archives.size > MAX_ARCHIVES) archives.delete(archives.keys().next().value);
};

const cachedArchive = (key) => {
  const state = archives.get(key);
  if (!state) return null;
  archives.delete(key);
  archives.set(key, state);
  return state;
};

const validateRange = ({ offset, length }) => {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)) throw new PmtilesError('Invalid PMTiles range');
  if (offset < 0 || length <= 0) throw new PmtilesError('Invalid PMTiles range');
  if (!Number.isSafeInteger(offset + length)) throw new PmtilesError('Invalid PMTiles range');
};

const fetchRangeObject = async ({ bucket, key, offset, length, missingAllowed }) => {
  let object;
  try {
    object = await bucket.get(key, { range: { offset, length } });
  } catch {
    throw new PmtilesError('PMTiles range read failed');
  }
  if (!object) {
    if (missingAllowed) return null;
    throw new PmtilesError('PMTiles range is missing');
  }
  return object;
};

const rangeBody = async ({ object, offset, length }) => {
  let bytes;
  try {
    bytes = new Uint8Array(await object.arrayBuffer());
  } catch {
    throw new PmtilesError('PMTiles range body is unreadable');
  }
  if (bytes.byteLength !== length) throw new PmtilesError('Truncated PMTiles range');
  if (Number.isSafeInteger(object.size) && safeEnd(offset, length, 'Invalid PMTiles range') > object.size) throw new PmtilesError('PMTiles range exceeds archive size');
  return { bytes, etag: object.httpEtag || object.etag || null, size: object.size };
};

const rangeBytes = async (options) => {
  validateRange(options);
  const object = await fetchRangeObject(options);
  return object ? rangeBody({ object, offset: options.offset, length: options.length }) : null;
};

const archiveState = async (bucket, key) => {
  const cached = cachedArchive(key);
  if (cached) return cached;
  const result = await rangeBytes({ bucket, key, offset: 0, length: HEADER_BYTES, missingAllowed: true });
  if (!result) return null;
  const header = parseHeader(result.bytes);
  validateArchiveRanges(header, result.size);
  const state = { header, etag: result.etag, directories: new Map() };
  cacheArchive(key, state);
  return state;
};

const validateArchiveSize = (size) => {
  if (!Number.isSafeInteger(size)) throw new PmtilesError('Invalid PMTiles archive size');
};

const validateRootRange = (header, size) => {
  const end = safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  if (header.rootOffset < HEADER_BYTES || end > size) throw new PmtilesError('PMTiles root directory exceeds archive size');
};

const validateMetadataRange = (header, size) => {
  if (!header.metadataLength) return;
  const metadataEnd = safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range');
  const rootEnd = safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  if (header.metadataOffset < rootEnd || metadataEnd > size) throw new PmtilesError('PMTiles metadata range exceeds archive size');
};

const validateLeafRange = (header, size) => {
  if (!header.leafLength) return;
  const leafEnd = safeEnd(header.leafOffset, header.leafLength, 'Invalid PMTiles leaf range');
  const metadataEnd = header.metadataLength ? safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range') : safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  if (header.leafOffset < metadataEnd || leafEnd > size) throw new PmtilesError('PMTiles leaf directory exceeds archive size');
};

const validateTileRange = (header, size) => {
  const directoryEnd = header.leafLength
    ? safeEnd(header.leafOffset, header.leafLength, 'Invalid PMTiles leaf range')
    : header.metadataLength
      ? safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range')
      : safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  const tileEnd = safeEnd(header.tileOffset, header.tileLength, 'Invalid PMTiles tile data range');
  if (header.tileOffset < directoryEnd || tileEnd > size) throw new PmtilesError('PMTiles tile data exceeds archive size');
};

const validateArchiveRanges = (header, size) => {
  validateArchiveSize(size);
  validateRootRange(header, size);
  validateMetadataRange(header, size);
  validateLeafRange(header, size);
  validateTileRange(header, size);
};

const directoryAt = async ({ bucket, key, state, offset, length }) => {
  if (length > MAX_DIRECTORY_BYTES) throw new PmtilesError('PMTiles directory is too large');
  const cacheKey = `${offset}:${length}`;
  if (state.directories.has(cacheKey)) {
    const cached = state.directories.get(cacheKey);
    state.directories.delete(cacheKey);
    state.directories.set(cacheKey, cached);
    return cached;
  }
  const range = await rangeBytes({ bucket, key, offset, length });
  const decoded = decodeDirectory(await decompressDirectory(range.bytes, state.header.internalCompression));
  state.directories.set(cacheKey, decoded);
  while (state.directories.size > MAX_DIRECTORIES) state.directories.delete(state.directories.keys().next().value);
  return decoded;
};

const directoryEntry = (entries, tileId) => {
  let found = null;
  for (const entry of entries) {
    if (entry.tileId > tileId) break;
    found = entry;
  }
  return found && (found.runLength === 0 || tileId < found.tileId + found.runLength) ? found : null;
};

const tileEntry = async ({ bucket, key, state, tileId }) => {
  const header = state.header;
  let entry = directoryEntry(await directoryAt({ bucket, key, state, offset: header.rootOffset, length: header.rootLength }), tileId);
  if (entry?.runLength === 0) {
    const leafEnd = safeEnd(entry.offset, entry.length, 'Invalid PMTiles leaf directory range');
    safeEnd(header.leafOffset, entry.offset, 'Invalid PMTiles leaf range');
    if (leafEnd > header.leafLength) throw new PmtilesError('PMTiles leaf directory entry exceeds its section');
    if (entry.length > MAX_DIRECTORY_BYTES) throw new PmtilesError('PMTiles leaf directory entry is too large');
    const leaf = await directoryAt({ bucket, key, state, offset: header.leafOffset + entry.offset, length: entry.length });
    entry = directoryEntry(leaf, tileId);
  }
  return entry;
};

const tileResult = async ({ bucket, key, state, entry, headOnly }) => {
  const header = state.header;
  if (!entry || entry.runLength === 0) return { state: 'missing-tile' };
  if (entry.length > MAX_TILE_BYTES) throw new PmtilesError('PMTiles tile entry is too large');
  const offset = safeEnd(header.tileOffset, entry.offset, 'Invalid PMTiles tile range');
  const length = entry.length;
  if (safeEnd(entry.offset, length, 'Invalid PMTiles tile entry range') > header.tileLength) throw new PmtilesError('PMTiles tile entry exceeds tile data section');
  const cleanEtag = state.etag?.replaceAll('"', '').trim();
  const safeEtag = cleanEtag && /^[A-Za-z0-9_:.~-]+$/.test(cleanEtag) ? cleanEtag : null;
  const etag = safeEtag ? `W/"${safeEtag}-${offset}-${length}"` : null;
  if (headOnly) return { state: 'found', length, etag };
  const range = await rangeBytes({ bucket, key, offset, length });
  return { state: 'found', bytes: range.bytes, length, etag };
};

export const readTile = async ({ bucket, key, zoom, x, y, minZoom, maxZoom, headOnly = false }) => {
  const state = await archiveState(bucket, key);
  if (!state) return { state: 'missing-archive' };
  const header = state.header;
  if (header.minZoom !== minZoom || header.maxZoom !== maxZoom) throw new PmtilesError('PMTiles zoom interval does not match catalog');
  if (zoom < header.minZoom || zoom > header.maxZoom) return { state: 'out-of-zoom' };
  if (!validTileCoordinate({ zoom, x, y })) return { state: 'missing-tile' };
  const entry = await tileEntry({ bucket, key, state, tileId: hilbertDistance(zoom, x, y) });
  return tileResult({ bucket, key, state, entry, headOnly });
};

export const clearPmtilesCacheForTests = () => archives.clear();
