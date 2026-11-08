import { GZIP_COMPRESSION, NO_COMPRESSION, PmtilesError } from './pmtiles-format.mjs';
import { PUBLISHED_TILE_CONTRACT } from './pmtiles-contract.mjs';

export const HEADER_BYTES = 127;
const MAX_ROOT_DIRECTORY_BYTES = 16_257;
const PNG_TILE_TYPE = 2;

const headerError = (message) => { throw new PmtilesError(message); };

const uint64 = (view, offset) => {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new PmtilesError('PMTiles offset exceeds safe range');
  return Number(value);
};

const headerFromBytes = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hasSignature = new TextDecoder().decode(bytes.slice(0, 7)) === 'PMTiles';
  if (!hasSignature || bytes[7] !== 3) headerError('Unsupported PMTiles archive');
  return {
    rootOffset: uint64(view, 8), rootLength: uint64(view, 16), metadataOffset: uint64(view, 24), metadataLength: uint64(view, 32),
    leafOffset: uint64(view, 40), leafLength: uint64(view, 48),
    tileOffset: uint64(view, 56), tileLength: uint64(view, 64), internalCompression: bytes[97],
    tileCompression: bytes[98], tileType: bytes[99], minZoom: bytes[100], maxZoom: bytes[101],
    minLon: view.getInt32(102, true), minLat: view.getInt32(106, true), maxLon: view.getInt32(110, true), maxLat: view.getInt32(114, true),
  };
};

const validateFormat = (header) => {
  if (header.tileType !== PNG_TILE_TYPE || header.tileCompression !== NO_COMPRESSION) headerError('PMTiles archive is not uncompressed PNG');
};

const validateCompression = (header) => {
  if (![NO_COMPRESSION, GZIP_COMPRESSION].includes(header.internalCompression)) headerError('Unsupported PMTiles directory compression');
};

const validateZoom = (header) => {
  if (header.minZoom !== PUBLISHED_TILE_CONTRACT.minZoom || header.maxZoom !== PUBLISHED_TILE_CONTRACT.maxZoom) headerError('PMTiles zoom interval does not match the published contract');
};

const validateBounds = (header) => {
  if (header.minLon !== PUBLISHED_TILE_CONTRACT.minLonE7) headerError('PMTiles bounds do not match the published contract');
  if (header.minLat !== PUBLISHED_TILE_CONTRACT.minLatE7) headerError('PMTiles bounds do not match the published contract');
  if (header.maxLon !== PUBLISHED_TILE_CONTRACT.maxLonE7) headerError('PMTiles bounds do not match the published contract');
  if (header.maxLat !== PUBLISHED_TILE_CONTRACT.maxLatE7) headerError('PMTiles bounds do not match the published contract');
};

const validateRootLength = (header) => {
  if (!header.rootLength) headerError('Invalid PMTiles root directory range');
  if (header.rootLength > MAX_ROOT_DIRECTORY_BYTES) headerError('Invalid PMTiles root directory range');
};

const HEADER_VALIDATORS = [validateFormat, validateCompression, validateZoom, validateBounds, validateRootLength];

const validateHeader = (header) => {
  for (const validate of HEADER_VALIDATORS) validate(header);
};

export const parseHeader = (bytes) => {
  if (bytes.byteLength !== HEADER_BYTES) headerError('Invalid PMTiles header length');
  const header = headerFromBytes(bytes);
  validateHeader(header);
  return header;
};
