export const MAX_DIRECTORY_BYTES = 2 * 1024 * 1024;
export const MAX_DIRECTORY_ENTRIES = 10000;
const NO_COMPRESSION = 1;

export class PmtilesError extends Error {}

export const safeEnd = (offset, length, message) => {
  const end = offset + length;
  if (!Number.isSafeInteger(end)) throw new PmtilesError(message);
  return end;
};

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

const readCompressedDirectory = async (reader) => {
  const chunks = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) return joinChunks(chunks, length);
    length += result.value.length;
    if (length > MAX_DIRECTORY_BYTES) throw new PmtilesError('PMTiles directory is too large');
    chunks.push(result.value);
  }
};

export const decompressDirectory = async (bytes, compression) => {
  if (compression === NO_COMPRESSION) return bytes;
  let reader;
  try {
    reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    return await readCompressedDirectory(reader);
  } catch (error) {
    try { await reader?.cancel(); } catch { /* Release a failed gzip stream. */ }
    if (error instanceof PmtilesError) throw error;
    throw new PmtilesError('Invalid compressed PMTiles directory');
  } finally {
    reader?.releaseLock();
  }
};

export const hilbertDistance = (zoom, x, y) => {
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
