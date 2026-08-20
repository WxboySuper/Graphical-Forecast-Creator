import { buildLandMask } from './buildLandMask';
import { fetchBoundaryGeoBundle } from './fetchBoundaryGeoBundle';
import type { LandMaskFeature, LandMaskStrategy } from './types';

let cachedStrategy: LandMaskStrategy | null = null;
let cachedLandMask: LandMaskFeature | null = null;
let inflight: Promise<LandMaskFeature | null> | null = null;

/** Clears the in-memory land mask cache (tests and strategy changes). */
export const clearLandMaskRuntimeCache = (): void => {
  cachedStrategy = null;
  cachedLandMask = null;
  inflight = null;
};

/** Returns the cached land mask when it matches the requested strategy. */
export const getCachedLandMask = (strategy: LandMaskStrategy): LandMaskFeature | null => {
  if (cachedStrategy === strategy && cachedLandMask) {
    return cachedLandMask;
  }
  return null;
};

/** Loads and caches a land mask for the requested strategy. */
export const ensureLandMask = async (
  strategy: LandMaskStrategy,
): Promise<LandMaskFeature | null> => {
  const cached = getCachedLandMask(strategy);
  if (cached) {
    return cached;
  }

  if (inflight) {
    return inflight;
  }

  inflight = fetchBoundaryGeoBundle()
    .then((boundaries) => buildLandMask(strategy, boundaries))
    .then((mask) => {
      cachedStrategy = strategy;
      cachedLandMask = mask;
      inflight = null;
      return mask;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });

  return inflight;
};
