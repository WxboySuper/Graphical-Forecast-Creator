import type { Feature as GeoJsonFeature } from 'geojson';
import type { MonitorOutlookLayerType } from './types';
import type { OutlookData, OutlookType } from '../types/outlooks';
import { coerceOutlookProbabilityMap } from '../utils/outlookMapCoercion';

export { MONITOR_OUTLOOK_LAYER_TYPES } from './types';
export { coerceOutlookProbabilityMap };

export const MONITOR_OUTLOOK_LAYER_LABELS: Record<MonitorOutlookLayerType, string> = {
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
  categorical: 'Categorical',
};

const KNOWN_CIG_LEVELS = new Set(['CIG1', 'CIG2', 'CIG3']);

export const isRenderableMonitorProbability = (probability: string): boolean => {
  if (!probability.startsWith('CIG')) {
    return true;
  }

  return KNOWN_CIG_LEVELS.has(probability);
};

export const flattenMonitorOutlookFeatures = (
  data: OutlookData | undefined,
  outlookType: MonitorOutlookLayerType,
): Array<{ outlookType: OutlookType; probability: string; feature: GeoJsonFeature }> => {
  if (!data) {
    return [];
  }

  const map = coerceOutlookProbabilityMap(data[outlookType]);
  if (!map) {
    return [];
  }

  const items: Array<{ outlookType: OutlookType; probability: string; feature: GeoJsonFeature }> = [];
  map.forEach((features, probability) => {
    if (!isRenderableMonitorProbability(probability)) {
      return;
    }

    features.forEach((feature) => {
      items.push({ outlookType, probability, feature });
    });
  });

  return items;
};
