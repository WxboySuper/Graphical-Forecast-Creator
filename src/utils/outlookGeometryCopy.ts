import { v4 as uuidv4 } from 'uuid';
import type { Feature } from 'geojson';
import type { DayType, OutlookType } from '../types/outlooks';
import { getAvailableProbabilities } from '../components/OutlookPanel/outlookPanelUtils';
import { cloneJsonValue } from '../store/cloneJsonValue';

export type ProbabilisticHazardType = 'tornado' | 'wind' | 'hail';
export type HazardGeometryCopyMode = 'replace' | 'merge';

export interface CopyOutlookGeometryOptions {
  sourceType: ProbabilisticHazardType;
  targetType: ProbabilisticHazardType;
  mode: HazardGeometryCopyMode;
  probabilityFilter?: string;
}

export interface CopyOutlookGeometryResult {
  copiedFeatureCount: number;
  copiedProbabilityKeys: string[];
}

export const PROBABILISTIC_HAZARD_TYPES: readonly ProbabilisticHazardType[] = [
  'tornado',
  'wind',
  'hail',
];

export function isProbabilisticHazardType(type: OutlookType): type is ProbabilisticHazardType {
  return (PROBABILISTIC_HAZARD_TYPES as readonly string[]).includes(type);
}

export function getCopyableProbabilityKeys(
  sourceType: ProbabilisticHazardType,
  targetType: ProbabilisticHazardType,
  day: DayType,
): string[] {
  const sourceKeys = getAvailableProbabilities(sourceType, day);
  const targetKeySet = new Set(getAvailableProbabilities(targetType, day));
  return sourceKeys.filter((key) => targetKeySet.has(key));
}

export function countOutlookMapFeatures(map?: Map<string, Feature[]>): number {
  if (!map) {
    return 0;
  }

  let total = 0;
  map.forEach((features) => {
    total += features.length;
  });
  return total;
}

export function countCopyableSourceFeatures(
  sourceMap: Map<string, Feature[]> | undefined,
  sourceType: ProbabilisticHazardType,
  targetType: ProbabilisticHazardType,
  day: DayType,
  probabilityFilter?: string,
): number {
  if (!sourceMap) {
    return 0;
  }

  const keys = probabilityFilter
    ? getCopyableProbabilityKeys(sourceType, targetType, day).filter((key) => key === probabilityFilter)
    : getCopyableProbabilityKeys(sourceType, targetType, day);

  return keys.reduce((sum, key) => sum + (sourceMap.get(key)?.length ?? 0), 0);
}

export function cloneGeometryAsFeature(
  source: Feature,
  targetType: ProbabilisticHazardType,
  targetProbability: string,
): Feature {
  const sourceOutlookType = source.properties?.outlookType;
  return {
    type: 'Feature',
    id: uuidv4(),
    geometry: cloneJsonValue(source.geometry),
    properties: {
      outlookType: targetType,
      probability: targetProbability,
      isSignificant: false,
      derivedFrom: `geometry-copy:${typeof sourceOutlookType === 'string' ? sourceOutlookType : 'unknown'}`,
    },
  };
}

export function copyOutlookGeometry(
  sourceMap: Map<string, Feature[]>,
  targetMap: Map<string, Feature[]>,
  options: CopyOutlookGeometryOptions,
  day: DayType,
): CopyOutlookGeometryResult {
  const { sourceType, targetType, mode, probabilityFilter } = options;
  const keys = probabilityFilter
    ? getCopyableProbabilityKeys(sourceType, targetType, day).filter((key) => key === probabilityFilter)
    : getCopyableProbabilityKeys(sourceType, targetType, day);

  if (mode === 'replace' && !probabilityFilter) {
    targetMap.clear();
  }

  let copiedFeatureCount = 0;
  const copiedProbabilityKeys: string[] = [];

  for (const key of keys) {
    const sourceFeatures = sourceMap.get(key);
    if (!sourceFeatures?.length) {
      continue;
    }

    const cloned = sourceFeatures.map((feature) => cloneGeometryAsFeature(feature, targetType, key));

    if (probabilityFilter) {
      targetMap.set(key, cloned);
    } else if (mode === 'merge') {
      const existing = targetMap.get(key) ?? [];
      targetMap.set(key, [...existing, ...cloned]);
    } else {
      targetMap.set(key, cloned);
    }

    copiedFeatureCount += cloned.length;
    copiedProbabilityKeys.push(key);
  }

  return { copiedFeatureCount, copiedProbabilityKeys };
}
