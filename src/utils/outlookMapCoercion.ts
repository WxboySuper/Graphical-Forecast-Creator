import type { Feature as GeoJsonFeature } from 'geojson';
import type { ForecastCycle, OutlookData } from '../types/outlooks';

/** Accepts Map-backed outlook data, serialized entry arrays, and plain objects from legacy persistence. */
export const coerceOutlookProbabilityMap = (
  map:
    | Map<string, GeoJsonFeature[]>
    | Record<string, GeoJsonFeature[]>
    | [string, GeoJsonFeature[]][]
    | undefined
    | unknown,
): Map<string, GeoJsonFeature[]> | null => {
  if (!map) {
    return null;
  }

  if (map instanceof Map) {
    return map;
  }

  if (Array.isArray(map)) {
    const entries = map.filter(
      (entry): entry is [string, GeoJsonFeature[]] =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        Array.isArray(entry[1]),
    );
    return new Map(entries);
  }

  if (typeof map === 'object') {
    return new Map(
      Object.entries(map as Record<string, GeoJsonFeature[]>).filter(
        ([, features]) => Array.isArray(features),
      ),
    );
  }

  return null;
};

/** Ensures every outlook probability map on a day is a Map instance. */
export const normalizeOutlookData = (data: OutlookData): OutlookData => {
  const normalized: OutlookData = {};
  const outlookKeys = ['tornado', 'wind', 'hail', 'totalSevere', 'categorical', 'day4-8'] as const;

  outlookKeys.forEach((key) => {
    const coerced = coerceOutlookProbabilityMap(data[key]);
    if (coerced && coerced.size > 0) {
      normalized[key] = coerced;
    }
  });

  return normalized;
};

/** Normalizes all day outlook maps on a forecast cycle (e.g. after legacy localStorage hydration). */
export const normalizeForecastCycle = (forecastCycle: ForecastCycle): ForecastCycle => {
  if (!forecastCycle?.days || typeof forecastCycle.days !== 'object') {
    return forecastCycle;
  }

  const days = { ...forecastCycle.days };

  (Object.keys(days) as unknown as Array<keyof typeof days>).forEach((dayKey) => {
    const dayData = days[dayKey];
    if (!dayData) {
      return;
    }

    days[dayKey] = {
      ...dayData,
      data: normalizeOutlookData(dayData.data),
    };
  });

  return {
    ...forecastCycle,
    days,
  };
};
