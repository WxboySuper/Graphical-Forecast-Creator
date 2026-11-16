import { HEADER_BYTES } from './pmtiles-header.mjs';
import { PmtilesError, safeEnd } from './pmtiles-format.mjs';

const MAX_ROOT_END = 16_384;

const validateArchiveSize = (size) => {
  if (!Number.isSafeInteger(size)) throw new PmtilesError('Invalid PMTiles archive size');
};

const assertSectionFits = (end, size) => {
  if (end > size) throw new PmtilesError('PMTiles section exceeds archive size');
};

const assertSectionsDoNotOverlap = (start, priorEnd, message) => {
  if (start < priorEnd) throw new PmtilesError(message);
};

const validateRootRange = (header, size) => {
  const end = safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  if (header.rootOffset < HEADER_BYTES) throw new PmtilesError('PMTiles root directory exceeds archive size');
  assertSectionFits(end, size);
  if (end > MAX_ROOT_END) throw new PmtilesError('PMTiles root directory exceeds archive size');
};

const validateMetadataRange = (header, size) => {
  if (!header.metadataLength) return;
  const metadataEnd = safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range');
  const rootEnd = safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  assertSectionsDoNotOverlap(header.metadataOffset, rootEnd, 'PMTiles metadata range overlaps root directory');
  assertSectionFits(metadataEnd, size);
};

const validateLeafRange = (header, size) => {
  if (!header.leafLength) return;
  const leafEnd = safeEnd(header.leafOffset, header.leafLength, 'Invalid PMTiles leaf range');
  const priorEnd = header.metadataLength
    ? safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range')
    : safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
  assertSectionsDoNotOverlap(header.leafOffset, priorEnd, 'PMTiles leaf directory overlaps the prior section');
  assertSectionFits(leafEnd, size);
};

const directoryEnd = (header) => {
  if (header.leafLength) return safeEnd(header.leafOffset, header.leafLength, 'Invalid PMTiles leaf range');
  if (header.metadataLength) return safeEnd(header.metadataOffset, header.metadataLength, 'Invalid PMTiles metadata range');
  return safeEnd(header.rootOffset, header.rootLength, 'Invalid PMTiles root range');
};

const validateTileRange = (header, size) => {
  const priorEnd = directoryEnd(header);
  const end = safeEnd(header.tileOffset, header.tileLength, 'Invalid PMTiles tile data range');
  assertSectionsDoNotOverlap(header.tileOffset, priorEnd, 'PMTiles tile data overlaps its directory section');
  assertSectionFits(end, size);
};

export const validateArchiveRanges = (header, size) => {
  validateArchiveSize(size);
  validateRootRange(header, size);
  validateMetadataRange(header, size);
  validateLeafRange(header, size);
  validateTileRange(header, size);
};
