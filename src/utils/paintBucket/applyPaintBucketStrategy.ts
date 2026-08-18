import type { Feature } from 'geojson';
import type { OutlookType } from '../../types/outlooks';
import {
  DEFAULT_PAINT_BUCKET_STRATEGY,
  PAINT_BUCKET_STRATEGY_STORAGE_KEY,
  type PaintBucketEditRequest,
  type PaintBucketEditResult,
  type PaintBucketStrategy,
} from './types';
import { polygonsOverlap, subtractPolygon, toPolygonFeature } from './paintBucketGeometry';

/** Reads the persisted prototype strategy, falling back to recategorize. */
export const readPaintBucketStrategy = (): PaintBucketStrategy => {
  if (typeof window === 'undefined') {
    return DEFAULT_PAINT_BUCKET_STRATEGY;
  }

  const stored = window.localStorage.getItem(PAINT_BUCKET_STRATEGY_STORAGE_KEY);
  if (
    stored === 'recategorize'
    || stored === 'step-up'
    || stored === 'step-down'
    || stored === 'subtract-overlap'
  ) {
    return stored;
  }

  return DEFAULT_PAINT_BUCKET_STRATEGY;
};

/** Persists the prototype strategy for local comparison testing. */
export const writePaintBucketStrategy = (strategy: PaintBucketStrategy): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(PAINT_BUCKET_STRATEGY_STORAGE_KEY, strategy);
};

/** Computes the destination probability for a bucket action. */
export const resolveTargetProbability = (
  strategy: PaintBucketStrategy,
  fromProbability: string,
  activeProbability: string,
  probabilityList: readonly string[],
): string | null => {
  const currentIndex = probabilityList.indexOf(fromProbability);

  switch (strategy) {
    case 'recategorize':
    case 'subtract-overlap':
      return fromProbability === activeProbability ? null : activeProbability;
    case 'step-up':
      if (currentIndex === -1) return null;
      return probabilityList[currentIndex + 1] ?? null;
    case 'step-down':
      if (currentIndex === -1) return null;
      return probabilityList[currentIndex - 1] ?? null;
    default:
      return null;
  }
};

const cloneOutlookMap = (outlookMap: Map<string, Feature[]>): Map<string, Feature[]> => {
  const cloned = new Map<string, Feature[]>();
  outlookMap.forEach((features, key) => {
    cloned.set(key, features.map((feature) => ({
      ...feature,
      properties: feature.properties ? { ...feature.properties } : feature.properties,
    })));
  });
  return cloned;
};

const setMapEntry = (
  map: Map<string, Feature[]>,
  key: string,
  features: Feature[],
): void => {
  if (features.length > 0) {
    map.set(key, features);
    return;
  }
  map.delete(key);
};

const findFeatureLocation = (
  outlookMap: Map<string, Feature[]>,
  featureId: string,
  preferredProbability?: string,
): { fromProbability: string; feature: Feature } | null => {
  const normalizedFeatureId = String(featureId);
  const searchOrder = preferredProbability
    ? [preferredProbability, ...Array.from(outlookMap.keys()).filter((key) => key !== preferredProbability)]
    : Array.from(outlookMap.keys());

  for (const probability of searchOrder) {
    const features = outlookMap.get(probability);
    const feature = features?.find((item) => String(item.id) === normalizedFeatureId);
    if (feature) {
      return { fromProbability: probability, feature };
    }
  }

  return null;
};

/** Subtracts `moved` geometry from every other feature except the moved id and target bucket. */
const subtractMovedGeometryFromOtherKeys = (
  outlookMap: Map<string, Feature[]>,
  moved: Feature,
  movedFeatureId: string,
  targetProbability: string,
): void => {
  const movedPolygon = toPolygonFeature(moved);
  if (!movedPolygon) {
    return;
  }

  outlookMap.forEach((features, probabilityKey) => {
    if (probabilityKey === targetProbability) {
      return;
    }

    const nextFeatures: Feature[] = [];
    features.forEach((feature) => {
      if (feature.id === movedFeatureId) {
        return;
      }

      const featurePolygon = toPolygonFeature(feature);
      if (!featurePolygon || !polygonsOverlap(featurePolygon, movedPolygon)) {
        nextFeatures.push(feature);
        return;
      }

      const remainder = subtractPolygon(featurePolygon, movedPolygon);
      if (remainder) {
        nextFeatures.push({
          ...feature,
          geometry: remainder.geometry,
        });
      }
    });

    setMapEntry(outlookMap, probabilityKey, nextFeatures);
  });
};

/** Applies a paint-bucket strategy to one feature within an outlook probability map. */
export const applyPaintBucketStrategy = (
  outlookMap: Map<string, Feature[]>,
  request: PaintBucketEditRequest,
): PaintBucketEditResult => {
  const located = findFeatureLocation(
    outlookMap,
    request.featureId,
    request.fromProbability,
  );
  if (!located) {
    return { changed: false, map: outlookMap };
  }

  const { fromProbability, feature } = located;
  const targetProbability = resolveTargetProbability(
    request.strategy,
    fromProbability,
    request.activeProbability,
    request.probabilityList,
  );

  if (!targetProbability) {
    return { changed: false, map: outlookMap };
  }

  const nextMap = cloneOutlookMap(outlookMap);
  const remainingSource = (nextMap.get(fromProbability) ?? []).filter(
    (item) => String(item.id) !== String(request.featureId),
  );
  setMapEntry(nextMap, fromProbability, remainingSource);

  const outlookType = (feature.properties?.outlookType as OutlookType) || request.outlookType;
  const movedFeature: Feature = {
    ...feature,
    properties: {
      ...feature.properties,
      outlookType,
      probability: targetProbability,
    },
  };

  if (request.strategy === 'subtract-overlap') {
    subtractMovedGeometryFromOtherKeys(
      nextMap,
      movedFeature,
      request.featureId,
      targetProbability,
    );
  }

  const targetFeatures = nextMap.get(targetProbability) ?? [];
  nextMap.set(targetProbability, [...targetFeatures, movedFeature]);

  return {
    changed: true,
    targetProbability,
    map: nextMap,
  };
};
