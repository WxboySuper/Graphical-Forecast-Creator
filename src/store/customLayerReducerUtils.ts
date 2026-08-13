import type { OneOffCustomLayer } from '../types/customProducts';
import type { ForecastState } from './forecastSlice';
import { DIRECT_REDUCER_TIMESTAMP } from './timestampMiddleware';

/** Clone custom-layer payloads without JSON coercion or browser-only APIs. */
export const cloneCustomValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneCustomValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const clone: Record<string, unknown> = {};
    Object.keys(source).forEach((key) => {
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: cloneCustomValue(source[key]),
        writable: true,
      });
    });
    return clone as T;
  }

  return value;
};

export const getCurrentCustomLayers = (state: ForecastState) =>
  state.forecastCycle.days[state.forecastCycle.currentDay]?.customLayers;

export const touchCustomLayer = (layer: OneOffCustomLayer, updatedAt: string) => {
  // Direct reducer calls use a stable timestamp fallback for replayability.
  // Never let that fallback invalidate the layer's persisted chronology.
  layer.updatedAt = updatedAt === DIRECT_REDUCER_TIMESTAMP ? layer.createdAt : updatedAt;
};

export const normalizeCustomOrder = <T extends { order: number }>(items: T[]) => {
  items.forEach((item, order) => { item.order = order; });
};

export const canMoveCustomItem = (index: number, target: number, length: number): boolean =>
  index >= 0 && target >= 0 && target < length;
