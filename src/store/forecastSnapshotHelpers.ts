import { isDraft, original } from "immer";
import type { Feature } from "geojson";

import type { OutlookData } from "../types/outlooks";
import type { CustomLayerCollection } from "../types/customProducts";
import { cloneJsonValue } from "./cloneJsonValue";

/** Clones one GeoJSON feature without JSON serialization. */
const cloneFeature = (feature: Feature): Feature => cloneJsonValue(feature);
const featureCloneCache = new WeakMap<object, Feature>();

/** Resolves the stable source object behind an Immer draft. */
const getFeatureCacheKey = (feature: Feature): object => {
  if (!isDraft(feature)) return feature;
  return original(feature) ?? feature;
};

/** Clones a feature once per stable source identity while building snapshots. */
const cloneFeatureCached = (feature: Feature): Feature => {
  const cacheKey = getFeatureCacheKey(feature);
  const cached = featureCloneCache.get(cacheKey);
  if (cached) return cached;
  const cloned = cloneFeature(feature);
  featureCloneCache.set(cacheKey, cloned);
  return cloned;
};

/** Deep-clones one probability map so snapshots do not share mutable arrays. */
export const cloneEntries = (map?: Map<string, Feature[]>): Map<string, Feature[]> | undefined => {
  if (!map) return undefined;
  return new Map(Array.from(map.entries(), ([probability, features]) => [
    probability,
    features.map(cloneFeatureCached),
  ]));
};

/** Deep-clones all outlook maps for a day so snapshots stay isolated from live edits. */
export const cloneOutlookData = (data: OutlookData): OutlookData => ({
  tornado: cloneEntries(data.tornado),
  wind: cloneEntries(data.wind),
  hail: cloneEntries(data.hail),
  totalSevere: cloneEntries(data.totalSevere),
  categorical: cloneEntries(data.categorical),
  "day4-8": cloneEntries(data["day4-8"]),
});

/** Deep-clones custom layer metadata for an isolated snapshot. */
export const cloneCustomLayers = (
  customLayers?: CustomLayerCollection,
): CustomLayerCollection | undefined => (customLayers ? cloneJsonValue(customLayers) : undefined);

/** Preserves stored custom content across cycle and day transitions. */
export const cloneIntegratedCustomLayers = (
  customLayers?: CustomLayerCollection,
): CustomLayerCollection | undefined => cloneCustomLayers(customLayers);
