import {
  CategoricalRiskLevel, 
  ColorMappings, 
  TornadoProbability, 
  WindHailProbability
} from '../types/outlooks';

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
  wind: {
    '5%': '#894826',
    '15%': '#ffc703',
    '15#': '#ffc703',
    '30%': '#fd0100',
    '30#': '#fd0100',
    '45%': '#fe00fe',
    '45#': '#fe00fe',
    '60%': '#912bee',
    '60#': '#912bee'
  },
  hail: {
    '5%': '#894826',
    '15%': '#ffc703',
    '15#': '#ffc703',
    '30%': '#fd0100',
    '30#': '#fd0100',
    '45%': '#fe00fe',
    '45#': '#fe00fe',
    '60%': '#912bee',
    '60#': '#912bee'
  },
  significant: '#000000' // Black hatch for significant threat areas
};

/**
 * Convert tornado probability to categorical risk level
 * @param probability Tornado probability
 * @returns Categorical risk level
 */
export function tornadoToCategorical(probability: TornadoProbability): CategoricalRiskLevel {
  const mapping: Record<string, CategoricalRiskLevel> = {
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
  return mapping[probability] ?? 'TSTM';
}

/**
 * Convert wind probability to categorical risk level
 * @param probability Wind probability
 * @returns Categorical risk level
 */
export function windToCategorical(probability: WindHailProbability): CategoricalRiskLevel {
  const mapping: Record<string, CategoricalRiskLevel> = {
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
  return mapping[probability] ?? 'TSTM';
}

/**
 * Convert hail probability to categorical risk level
 * @param probability Hail probability
 * @returns Categorical risk level
 */
export function hailToCategorical(probability: WindHailProbability): CategoricalRiskLevel {
  const mapping: Record<string, CategoricalRiskLevel> = {
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
  return mapping[probability] ?? 'TSTM';
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

/**
 * Gets the display name for a categorical risk level
 * @param risk The categorical risk level
 * @returns The display name with numerical rating
 */
export function getCategoricalRiskDisplayName(risk: CategoricalRiskLevel): string {
  switch (risk) {
    case 'TSTM':
      return 'General Thunder (0/5)';
    case 'MRGL':
      return 'Marginal Risk (1/5)';
    case 'SLGT':
      return 'Slight Risk (2/5)';
    case 'ENH':
      return 'Enhanced Risk (3/5)';
    case 'MDT':
      return 'Moderate Risk (4/5)';
    case 'HIGH':
      return 'High Risk (5/5)';
    default:
      return 'Unknown';
  }
}