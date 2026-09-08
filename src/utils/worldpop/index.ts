/**
 * WorldPop utilities. Exports the client and geometry helpers for population boundary data.
 */
export { estimatePopulation } from './client';
export type {
  WorldPopEstimate,
  WorldPopEstimateOptions,
  WorldPopGeometry,
  WorldPopResolution,
} from './client';
export { unionForecastPolygons } from './geometry';