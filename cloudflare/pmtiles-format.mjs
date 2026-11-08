import { addTileIdDelta, validateDirectoryOrdering } from './pmtiles-directory-validation.mjs';
import { PmtilesError } from './pmtiles-error.mjs';

export const MAX_DIRECTORY_BYTES = 2 * 1024 * 1024;
export const MAX_DIRECTORY_ENTRIES = 10000;
export const NO_COMPRESSION = 1;
export const GZIP_COMPRESSION = 2;

export { PmtilesError };

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

const readVarintColumn = (bytes, cursor, count) => {
  const values = [];
  for (let index = 0; index < count; index += 1) values.push(readVarint(bytes, cursor));
  return values;
};

const readDirectoryColumns = (bytes, cursor, count) => {
  const tileIds = [];
  let lastId = 0;
  for (let index = 0; index < count; index += 1) {
    lastId = addTileIdDelta(lastId, readVarint(bytes, cursor));
    tileIds.push(lastId);
  }
  const runs = readVarintColumn(bytes, cursor, count);
  const lengths = readVarintColumn(bytes, cursor, count);
  return { tileIds, runs, lengths };
};

const validateDirectoryEntry = ({ offset, length, tileId, runLength }) => {
  if (length <= 0) throw new PmtilesError('Invalid PMTiles directory entry length');
  if (!Number.isSafeInteger(offset + length)) throw new PmtilesError('Invalid PMTiles directory byte range');
  if (!Number.isSafeInteger(tileId + runLength)) throw new PmtilesError('Invalid PMTiles tile id range');
};

const directoryEntries = (bytes, cursor, columns) => {
  const entries = [];
  let lastOffset = 0;
  let lastLength = 0;
  for (let index = 0; index < columns.tileIds.length; index += 1) {
    const encodedOffset = readVarint(bytes, cursor);
    const offset = encodedOffset === 0 ? lastOffset + lastLength : encodedOffset - 1;
    const length = columns.lengths[index];
    validateDirectoryEntry({ offset, length, tileId: columns.tileIds[index], runLength: columns.runs[index] });
    entries.push({ tileId: columns.tileIds[index], runLength: columns.runs[index], offset, length });
    lastOffset = offset;
    lastLength = length;
  }
  return entries;
};

const validDirectoryCount = (count) => Number.isSafeInteger(count) && count <= MAX_DIRECTORY_ENTRIES;
const hasTrailingBytes = (cursor, bytes) => cursor.offset !== bytes.length;

export const decodeDirectory = (bytes) => {
  const cursor = { offset: 0 };
  const count = readVarint(bytes, cursor);
  if (!validDirectoryCount(count)) throw new PmtilesError('Invalid PMTiles directory entry count');
  const columns = readDirectoryColumns(bytes, cursor, count);
  validateDirectoryOrdering(columns);
  const entries = directoryEntries(bytes, cursor, columns);
  if (hasTrailingBytes(cursor, bytes)) throw new PmtilesError('Trailing PMTiles directory data');
  return entries;
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
