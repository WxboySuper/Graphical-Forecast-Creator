import { PmtilesError } from './pmtiles-error.mjs';

export const addTileIdDelta = (lastId, delta) => {
  const nextId = lastId + delta;
  if (!Number.isSafeInteger(nextId)) throw new PmtilesError('Invalid PMTiles tile id range');
  return nextId;
};

const validateIncreasingTileId = (previousId, nextId) => {
  if (nextId <= previousId) throw new PmtilesError('PMTiles directory tile IDs are not ordered');
};

const validateTileRun = (previousId, previousRun, nextId) => {
  if (previousRun === 0) return;
  const runEnd = previousId + previousRun;
  if (!Number.isSafeInteger(runEnd)) throw new PmtilesError('Invalid PMTiles tile id range');
  if (nextId < runEnd) throw new PmtilesError('PMTiles directory tile runs overlap');
};

export const validateDirectoryOrdering = ({ tileIds, runs }) => {
  for (let index = 1; index < tileIds.length; index += 1) {
    validateIncreasingTileId(tileIds[index - 1], tileIds[index]);
    validateTileRun(tileIds[index - 1], runs[index - 1], tileIds[index]);
  }
};
