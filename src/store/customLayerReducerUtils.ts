import type { OneOffCustomLayer } from '../types/customProducts';
import type { ForecastState } from './forecastSlice';
import { DIRECT_REDUCER_TIMESTAMP } from './timestampMiddleware';

/** Documents cloneCustomValue. */
export const cloneCustomValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Documents getCurrentCustomLayers. */
export const getCurrentCustomLayers = (state: ForecastState) =>
  state.forecastCycle.days[state.forecastCycle.currentDay]?.customLayers;

/** Documents touchCustomLayer. */
export const touchCustomLayer = (layer: OneOffCustomLayer, updatedAt: string) => {
  // Direct reducer calls use a stable timestamp fallback for replayability.
  // Never let that fallback invalidate the layer's persisted chronology.
  layer.updatedAt = updatedAt === DIRECT_REDUCER_TIMESTAMP ? layer.createdAt : updatedAt;
};

/** Documents normalizeCustomOrder. */
export const normalizeCustomOrder = <T extends { order: number }>(items: T[]) => {
  items.forEach((item, order) => { item.order = order; });
};

/** Documents canMoveCustomItem. */
export const canMoveCustomItem = (index: number, target: number, length: number): boolean =>
  index >= 0 && target >= 0 && target < length;
