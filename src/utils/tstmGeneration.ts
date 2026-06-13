import type { Feature } from 'geojson';
import type { DayType } from '../types/outlooks';

/** Returns true when SPC calibrated thunder can cover the given outlook day. */
export const canGenerateTstmForDay = (day: DayType): boolean => day === 1 || day === 2;

/** Produces a stable JSON-like value so object key insertion order does not affect equality. */
const sortJsonKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonKeys(entry)])
    );
  }
  return value;
};

/** Compares generated feature arrays without depending on object key insertion order. */
export const areTstmFeaturesEqual = (left: Feature[], right: Feature[]): boolean =>
  JSON.stringify(sortJsonKeys(left)) === JSON.stringify(sortJsonKeys(right));

/** Normalizes generated polygons so they can enter the existing editable categorical/TSTM flow. */
export const normalizeGeneratedTstmFeatures = (features: Feature[]): Feature[] =>
  features
    .filter(
      (feature) =>
        feature.type === 'Feature' &&
        (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon')
    )
    .map((feature, index) => ({
      ...feature,
      id: feature.id ?? `generated-tstm-${index}`,
      properties: {
        ...feature.properties,
        outlookType: 'categorical',
        probability: 'TSTM',
        isSignificant: false,
        derivedFrom: 'spc-href-calibrated-thunder',
        originalProbability: 'TSTM',
      },
    }));
