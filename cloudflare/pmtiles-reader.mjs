import { HEADER_BYTES, parseHeader } from './pmtiles-header.mjs';
import { validateArchiveRanges } from './pmtiles-layout.mjs';
import { decompressDirectory } from './pmtiles-compression.mjs';
import {
  MAX_DIRECTORY_BYTES, PmtilesError, safeEnd, decodeDirectory, hilbertDistance,
} from './pmtiles-format.mjs';

export { decodeDirectory, parseHeader, PmtilesError };

const MAX_ARCHIVES = 8;
const MAX_DIRECTORIES = 4;
const MAX_TILE_BYTES = 8 * 1024 * 1024;
const archives = new Map();

const integerCoordinate = (value) => Number.isInteger(value);
const inTileBounds = (value, zoom) => {
  if (value < 0) return false;
  return value < 2 ** zoom;
};
const validTileCoordinate = ({ zoom, x, y }) => {
  if (!integerCoordinate(x) || !integerCoordinate(y)) return false;
  if (!inTileBounds(x, zoom)) return false;
  return inTileBounds(y, zoom);
};

const cacheArchive = (key, state) => {
  // Archive keys are create-only under the published catalog contract.
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

const readRangeBody = async (object) => {
  try {
    return new Uint8Array(await object.arrayBuffer());
  } catch {
    throw new PmtilesError('PMTiles range body is unreadable');
  }
};

const validateRangeBody = ({ object, bytes, offset, length }) => {
  if (bytes.byteLength !== length) throw new PmtilesError('Truncated PMTiles range');
  if (Number.isSafeInteger(object.size) && safeEnd(offset, length, 'Invalid PMTiles range') > object.size) throw new PmtilesError('PMTiles range exceeds archive size');
};

const rangeBody = async ({ object, offset, length }) => {
  const bytes = await readRangeBody(object);
  validateRangeBody({ object, bytes, offset, length });
  return { bytes, etag: object.httpEtag || object.etag || null, size: object.size };
};

const rangeBytes = async (options) => {
  validateRange(options);
  const object = await fetchRangeObject(options);
  return object ? rangeBody({ object, offset: options.offset, length: options.length }) : null;
};

const assertArchiveIdentity = ({ state, range }) => {
  if (state.etag && range.etag && state.etag !== range.etag) throw new PmtilesError('PMTiles archive changed during request');
  if (Number.isSafeInteger(state.size) && Number.isSafeInteger(range.size) && state.size !== range.size) {
    throw new PmtilesError('PMTiles archive changed during request');
  }
};

const archiveState = async (bucket, key) => {
  const cached = cachedArchive(key);
  if (cached) return cached;
  const result = await rangeBytes({ bucket, key, offset: 0, length: HEADER_BYTES, missingAllowed: true });
  if (!result) return null;
  const header = parseHeader(result.bytes);
  validateArchiveRanges(header, result.size);
  const state = { header, etag: result.etag, size: result.size, directories: new Map() };
  cacheArchive(key, state);
  return state;
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
  assertArchiveIdentity({ state, range });
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

const leafEntry = async ({ bucket, key, state, tileId, entry }) => {
  const header = state.header;
  const end = safeEnd(entry.offset, entry.length, 'Invalid PMTiles leaf directory range');
  const offset = safeEnd(header.leafOffset, entry.offset, 'Invalid PMTiles leaf range');
  if (end > header.leafLength) throw new PmtilesError('PMTiles leaf directory entry exceeds its section');
  if (entry.length > MAX_DIRECTORY_BYTES) throw new PmtilesError('PMTiles leaf directory entry is too large');
  const leaf = await directoryAt({ bucket, key, state, offset, length: entry.length });
  const resolved = directoryEntry(leaf, tileId);
  if (resolved?.runLength === 0) throw new PmtilesError('PMTiles leaf directory cannot reference another leaf');
  return resolved;
};

const tileEntry = async ({ bucket, key, state, tileId }) => {
  const { header } = state;
  const root = await directoryAt({ bucket, key, state, offset: header.rootOffset, length: header.rootLength });
  const entry = directoryEntry(root, tileId);
  if (entry?.runLength !== 0) return entry;
  return leafEntry({ bucket, key, state, tileId, entry });
};

const tileRange = (header, entry) => {
  if (entry.length > MAX_TILE_BYTES) throw new PmtilesError('PMTiles tile entry is too large');
  const offset = safeEnd(header.tileOffset, entry.offset, 'Invalid PMTiles tile range');
  if (safeEnd(entry.offset, entry.length, 'Invalid PMTiles tile entry range') > header.tileLength) throw new PmtilesError('PMTiles tile entry exceeds tile data section');
  return { offset, length: entry.length };
};

const tileEtag = (etag, range) => {
  const clean = etag?.replaceAll('"', '').trim();
  if (!clean || !/^[A-Za-z0-9_:.~-]+$/.test(clean)) return null;
  return `W/"${clean}-${range.offset}-${range.length}"`;
};

const tileResult = async ({ bucket, key, state, entry, headOnly }) => {
  const header = state.header;
  if (!entry || entry.runLength === 0) return { state: 'missing-tile' };
  const range = tileRange(header, entry);
  const etag = tileEtag(state.etag, range);
  const data = await rangeBytes({ bucket, key, ...range, ...(headOnly ? { length: 1 } : {}) });
  assertArchiveIdentity({ state, range: data });
  if (headOnly) return { state: 'found', length: range.length, etag };
  return { state: 'found', bytes: data.bytes, length: range.length, etag };
};

export const readTile = async ({ bucket, key, zoom, x, y, minZoom, maxZoom, headOnly = false }) => {
  const state = await archiveState(bucket, key);
  if (!state) return { state: 'missing-archive' };
  const header = state.header;
  if (header.minZoom !== minZoom || header.maxZoom !== maxZoom) throw new PmtilesError('PMTiles zoom interval does not match catalog');
  if (!Number.isInteger(zoom) || zoom < header.minZoom || zoom > header.maxZoom) return { state: 'out-of-zoom' };
  if (!validTileCoordinate({ zoom, x, y })) return { state: 'missing-tile' };
  const entry = await tileEntry({ bucket, key, state, tileId: hilbertDistance(zoom, x, y) });
  return tileResult({ bucket, key, state, entry, headOnly });
};

export const clearPmtilesCacheForTests = () => archives.clear();
