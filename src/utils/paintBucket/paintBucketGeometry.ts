import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

type PolygonFeature = Feature<Polygon | MultiPolygon>;

const isPolygonGeometry = (
  feature: Feature,
): feature is PolygonFeature =>
  feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon';

/** Removes polygons that Turf cannot operate on. */
export const toPolygonFeature = (feature: Feature): PolygonFeature | null => {
  if (!isPolygonGeometry(feature)) {
    return null;
  }
  return feature;
};

const createPairCollection = (): FeatureCollection<Polygon | MultiPolygon> => ({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
  ],
});

const pairCollection = createPairCollection();

/** Subtracts `clip` from `target`, returning the remainder or null when fully covered. */
export const subtractPolygon = (
  target: PolygonFeature,
  clip: PolygonFeature,
): PolygonFeature | null => {
  pairCollection.features[0] = target;
  pairCollection.features[1] = clip;

  try {
    const result = turf.difference(pairCollection);
    if (!result || !result.geometry) {
      return null;
    }
    return result as PolygonFeature;
  } catch {
    return target;
  }
};

/** Returns true when two polygon features share any area. */
export const polygonsOverlap = (a: PolygonFeature, b: PolygonFeature): boolean => {
  pairCollection.features[0] = a;
  pairCollection.features[1] = b;

  try {
    return Boolean(turf.intersect(pairCollection));
  } catch {
    return false;
  }
};
