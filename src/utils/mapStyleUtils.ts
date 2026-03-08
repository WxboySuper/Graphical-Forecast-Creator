import { OutlookType } from '../types/outlooks';
import { colorMappings } from './outlookUtils';
import { Feature } from 'geojson';

export type FeatureStyle = {
  color?: string;
  weight?: number;
  opacity?: number;
  className?: string;
  zIndex?: number;
  fillColor?: string;
  fillOpacity?: number;
};

const RISK_ORDER: Record<string, number> = {
  TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5
};

/**
 * Sort probability entries for rendering order.
 * - Places CIG entries after numeric probabilities and sorts them lexicographically.
 * - Keeps 'TSTM' at the start.
 * - Uses `RISK_ORDER` for categorical ordering when available.
 * - Falls back to numeric percent ordering for percentage-style probabilities.
 *
 * @param entries - Array of `[probability, features]` tuples to sort
 * @returns A new array sorted according to rendering priority
 */
export const sortProbabilities = (entries: [string, Feature[]][]): [string, Feature[]][] => {
  return [...entries].sort((a, b) => {
    const [probA, probB] = [a[0], b[0]];

    const isCigA = probA.startsWith('CIG');
    const isCigB = probB.startsWith('CIG');
    
    if (isCigA !== isCigB) {
      return isCigA ? 1 : -1;
    }
    
    if (isCigA && isCigB) {
      return probA.localeCompare(probB);
    }

    if (probA === 'TSTM') return -1;
    if (probB === 'TSTM') return 1;

    if (RISK_ORDER[probA] !== undefined && RISK_ORDER[probB] !== undefined) {
      return RISK_ORDER[probA] - RISK_ORDER[probB];
    }

    /**
     * Extract a numeric percent value from a probability string (e.g. '40%' -> 40).
     * Non-numeric strings return 0.
     *
     * @param prob - Probability string to parse
     * @returns Numeric percent value or 0
     */
    const getPercentValue = (prob: string) => parseInt(prob.replace(/[^0-9]/g, '')) || 0;
    return getPercentValue(probA) - getPercentValue(probB);
  });
};

/**
 * Lookup display color for a given outlook type and probability.
 * Falls back to white ('#FFFFFF') if no mapping exists.
 *
 * @param outlookType - The outlook type (e.g. 'categorical', 'tornado')
 * @param probability - The probability key to lookup
 * @returns Hex color string for use as a fill color
 */
export const lookupColor = (outlookType: OutlookType, probability: string) => {
  const mapping = colorMappings[outlookType as keyof typeof colorMappings];
  if (mapping && typeof mapping === 'object' && probability in mapping) {
    return (mapping as Record<string, string>)[probability];
  }
  return '#FFFFFF';
};

/**
 * Compute a z-index for drawing features based on outlook type
 * and probability so higher-risk polygons render above lower-risk ones.
 *
 * @param outlookType - The outlook type
 * @param probability - The probability string used to weight ordering
 * @returns Numeric z-index for layer/feature ordering
 */
export const computeZIndex = (outlookType: OutlookType, probability: string) => {
  let baseZIndex = 400;
  if (outlookType === 'categorical') {
    baseZIndex += (RISK_ORDER[probability] || 0) * 10;
  } else {
    if (probability.startsWith('CIG')) {
      baseZIndex = 600;
      baseZIndex += parseInt(probability.replace('CIG', '')) || 0;
    } else {
      baseZIndex += parseInt(probability) || 0;
    }
  }
  return baseZIndex;
};

/**
 * Create a `FeatureStyle` describing stroke/fill and z-index for a
 * specific outlook/probability combination. Handles special 'CIG'
 * pattern values and provides sensible defaults for categorical and
 * non-categorical outlooks.
 *
 * @param outlookType - The outlook type (e.g. 'categorical')
 * @param probability - The probability string
 * @returns A `FeatureStyle` object used by rendering code
 */
export const getFeatureStyle = (outlookType: OutlookType, probability: string): FeatureStyle => {
  if (probability.startsWith('CIG')) {
    const patternMap: Record<string, string> = {
      'CIG1': 'url(#pattern-cig1)',
      'CIG2': 'url(#pattern-cig2)',
      'CIG3': 'url(#pattern-cig3)',
      'CIG0': 'none'
    };
    const fill = patternMap[probability] || 'none';
    return {
      color: '#000000',
      weight: 1,
      opacity: 1,
      fillColor: fill,
      fillOpacity: 1,
      zIndex: computeZIndex(outlookType, probability),
      className: 'hatching-layer'
    };
  }

  const color = lookupColor(outlookType, probability);
  // Categorical polygons are nested (MRGL contains SLGT contains ENH…).
  // On the map, a dedicated categorical VectorLayer renders them at full
  // fill opacity with layer-level 0.5 opacity, so higher-risk polygons
  // completely cover lower-risk ones without color blending.
  // This value is used as a fallback / for export utilities.
  const fillOpacity = outlookType === 'categorical' ? 0.5 : 0.3;
  return {
    color: '#000000',
    weight: 2,
    opacity: 1,
    fillColor: color,
    fillOpacity,
    zIndex: computeZIndex(outlookType, probability)
  };
};
