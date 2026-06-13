import type { Feature } from 'geojson';

/** Returns true when SPC calibrated thunder can cover the given outlook day. */
export const canGenerateTstmForDay = (day: number): boolean => day === 1 || day === 2;

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
