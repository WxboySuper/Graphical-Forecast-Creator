import { HEADER_BYTES } from './pmtiles-header.mjs';
import { PmtilesError, safeEnd } from './pmtiles-format.mjs';

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
  const priorEnd = header.metadataLength
    ? safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range')
    : safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  if (header.leafOffset < priorEnd || leafEnd > size) throw new PmtilesError('PMTiles leaf directory exceeds archive size');
};

const directoryEnd = (header) => {
  if (header.leafLength) return safeEnd(header.leafOffset, header.leafLength, 'Invalid PMTiles leaf range');
  if (header.metadataLength) return safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range');
  return safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
};

const validateTileRange = (header, size) => {
  const priorEnd = directoryEnd(header);
  const end = safeEnd(header.tileOffset, header.tileLength, 'Invalid PMTiles tile data range');
  if (header.tileOffset < priorEnd || end > size) throw new PmtilesError('PMTiles tile data exceeds archive size');
};

export const validateArchiveRanges = (header, size) => {
  validateArchiveSize(size);
  validateRootRange(header, size);
  validateMetadataRange(header, size);
  validateLeafRange(header, size);
  validateTileRange(header, size);
};
