import { PathOptions } from 'leaflet';
import { GeoJSON } from 'leaflet';
import {
  CategoricalRiskLevel, 
  ColorMappings, 
  OutlookType,
  TornadoProbability, 
  WindHailProbability
} from '../types/outlooks';

// Common colors for Wind and Hail since they share the same probability scale and colors
const WIND_HAIL_COLORS: Record<WindHailProbability, string> = {
  '5%': '#894826',
  '15%': '#ffc703',
  '15#': '#ffc703',
  '30%': '#fd0100',
  '30#': '#fd0100',
  '45%': '#fe00fe',
  '45#': '#fe00fe',
  '60%': '#912bee',
  '60#': '#912bee'
};

/**
 * Color mappings for all outlook types based on specifications in Outlook_Info.md
 */
export const colorMappings: ColorMappings = {
  categorical: {
    'TSTM': '#bfe7bc', // General Thunderstorm (0/5)
    'MRGL': '#7dc580', // Marginal (1/5)
    'SLGT': '#f3f67d', // Slight (2/5)
    'ENH': '#e5c27f',  // Enhanced (3/5)
    'MDT': '#e67f7e',  // Moderate (4/5)
    'HIGH': '#fe7ffe'  // High (5/5)
  },
  tornado: {
    '2%': '#008b02',
    '5%': '#89472a',
    '10%': '#fdc900',
    '10#': '#fdc900',
    '15%': '#fe0000',
    '15#': '#fe0000',
    '30%': '#fe00ff',
    '30#': '#fe00ff',
    '45%': '#952ae7',
    '45#': '#952ae7',
    '60%': '#114d8c',
    '60#': '#114d8c'
  },
  wind: WIND_HAIL_COLORS,
  hail: WIND_HAIL_COLORS,
  significant: '#000000' // Black hatch for significant threat areas
};

// Probability to Categorical Risk Mappings
const TORNADO_MAPPING: Record<string, CategoricalRiskLevel> = {
  '2%': 'MRGL',
  '5%': 'SLGT',
  '10%': 'ENH',
  '10#': 'ENH',
  '15%': 'ENH',
  '15#': 'MDT',
  '30%': 'MDT',
  '30#': 'HIGH',
  '45%': 'HIGH',
  '45#': 'HIGH',
  '60%': 'HIGH',
  '60#': 'HIGH'
};

const WIND_MAPPING: Record<string, CategoricalRiskLevel> = {
  '5%': 'MRGL',
  '15%': 'SLGT',
  '15#': 'SLGT',
  '30%': 'ENH',
  '30#': 'ENH',
  '45%': 'ENH',
  '45#': 'MDT',
  '60%': 'MDT',
  '60#': 'HIGH'
};

const HAIL_MAPPING: Record<string, CategoricalRiskLevel> = {
  '5%': 'MRGL',
  '15%': 'SLGT',
  '15#': 'SLGT',
  '30%': 'ENH',
  '30#': 'ENH',
  '45%': 'ENH',
  '45#': 'MDT',
  '60%': 'MDT',
  '60#': 'MDT'
};

/**
 * Helper to lookup risk level from a mapping
 */
function getRiskFromMapping(mapping: Record<string, CategoricalRiskLevel>, probability: string): CategoricalRiskLevel {
  return mapping[probability] ?? 'TSTM';
}

/**
 * Convert tornado probability to categorical risk level
 * @param probability Tornado probability
 * @returns Categorical risk level
 */
export function tornadoToCategorical(probability: TornadoProbability): CategoricalRiskLevel {
  return getRiskFromMapping(TORNADO_MAPPING, probability);
}

/**
 * Convert wind probability to categorical risk level
 * @param probability Wind probability
 * @returns Categorical risk level
 */
export function windToCategorical(probability: WindHailProbability): CategoricalRiskLevel {
  return getRiskFromMapping(WIND_MAPPING, probability);
}

/**
 * Convert hail probability to categorical risk level
 * @param probability Hail probability
 * @returns Categorical risk level
 */
export function hailToCategorical(probability: WindHailProbability): CategoricalRiskLevel {
  return getRiskFromMapping(HAIL_MAPPING, probability);
}

/**
 * Determines if a probability string represents a significant threat
 * @param probability The probability string to check
 * @returns True if it's a significant threat (contains #), false otherwise
 */
export function isSignificantThreat(probability: string): boolean {
  return probability.includes('#');
}

/**
 * Get the highest categorical risk level from multiple probabilistic outlooks
 * @param tornadoProb Tornado probability or undefined if not set
 * @param windProb Wind probability or undefined if not set
 * @param hailProb Hail probability or undefined if not set
 * @returns The highest categorical risk level from the three probabilistic outlooks
 */
export function getHighestCategoricalRisk(
  tornadoProb?: TornadoProbability,
  windProb?: WindHailProbability,
  hailProb?: WindHailProbability
): CategoricalRiskLevel {
  const riskValues: { [key in CategoricalRiskLevel]: number } = {
    TSTM: 0,
    MRGL: 1,
    SLGT: 2,
    ENH: 3,
    MDT: 4,
    HIGH: 5
  };

  const candidates: CategoricalRiskLevel[] = [];
  if (tornadoProb) candidates.push(tornadoToCategorical(tornadoProb));
  if (windProb) candidates.push(windToCategorical(windProb));
  if (hailProb) candidates.push(hailToCategorical(hailProb));

  if (candidates.length === 0) return 'TSTM';

  return candidates.reduce((best, current) => (
    riskValues[current] > riskValues[best] ? current : best
  ), candidates[0]);
}

// Display Name Mapping
const RISK_DISPLAY_NAMES: Record<CategoricalRiskLevel, string> = {
  'TSTM': 'General Thunder (0/5)',
  'MRGL': 'Marginal Risk (1/5)',
  'SLGT': 'Slight Risk (2/5)',
  'ENH': 'Enhanced Risk (3/5)',
  'MDT': 'Moderate Risk (4/5)',
  'HIGH': 'High Risk (5/5)'
};

/**
 * Gets the display name for a categorical risk level
 * @param risk The categorical risk level
 * @returns The display name with numerical rating
 */
export function getCategoricalRiskDisplayName(risk: CategoricalRiskLevel): string {
  return RISK_DISPLAY_NAMES[risk] || 'Unknown';
}

// ---- Map Styling and Rendering Helpers ----

export const RISK_ORDER: Record<string, number> = {
  'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5
};

export const lookupColor = (outlookType: OutlookType, probability: string): string => {
  // Use a map to handle the lookup to avoid complex switch statements
  const colorMap: Record<OutlookType, Record<string, string>> = {
    'categorical': colorMappings.categorical,
    'tornado': colorMappings.tornado,
    'wind': colorMappings.wind,
    'hail': colorMappings.hail
  };

  const outlookColors = colorMap[outlookType];
  if (!outlookColors) return '#FFFFFF';

  return outlookColors[probability as keyof typeof outlookColors] || '#FFFFFF';
};

export const computeZIndex = (outlookType: OutlookType, probability: string): number => {
  let baseZIndex = 400;
  if (outlookType === 'categorical') {
    baseZIndex += (RISK_ORDER[probability] || 0) * 10;
  } else if (['tornado', 'wind', 'hail'].includes(outlookType)) {
    baseZIndex += parseInt(probability) || 0;
  }

  if (probability.includes('#')) baseZIndex += 5;
  return baseZIndex;
};

export type FeatureStyle = PathOptions & {
  className?: string;
  zIndex?: number;
  fillColor?: string;
  fillOpacity?: number;
};

export const getFeatureStyle = (outlookType: OutlookType, probability: string): FeatureStyle => {
  const color = lookupColor(outlookType, probability);
  const significant = probability.includes('#');
  const fillColor = significant ? 'url(#hatchPattern)' : color;
  const fillOpacity = significant ? 1 : 0.6;
  const zIndex = computeZIndex(outlookType, probability);

  return {
    color: significant ? 'transparent' : color,
    weight: 2,
    opacity: 1,
    fillColor,
    fillOpacity,
    zIndex,
    className: significant ? 'significant-threat-pattern' : undefined
  };
};

export const sortProbabilities = (entries: [string, GeoJSON.Feature[]][]): [string, GeoJSON.Feature[]][] => {
  return entries.sort((a, b) => {
    const [probA, probB] = [a[0], b[0]];

    if (probA === 'TSTM') return -1;
    if (probB === 'TSTM') return 1;

    const isSignificantA = probA.includes('#');
    const isSignificantB = probB.includes('#');
    if (isSignificantA !== isSignificantB) {
      return isSignificantA ? 1 : -1;
    }

    if (RISK_ORDER[probA] !== undefined && RISK_ORDER[probB] !== undefined) {
      return RISK_ORDER[probA] - RISK_ORDER[probB];
    }

    const getPercentValue = (prob: string) => parseInt(prob.replace(/[^0-9]/g, ''));
    return getPercentValue(probA) - getPercentValue(probB);
  });
};
