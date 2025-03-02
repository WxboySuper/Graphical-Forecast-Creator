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
  // Conversion table based on Outlook_Info.md
  switch (probability) {
    case '2%':
      return 'MRGL';
    case '5%':
      return 'SLGT';
    case '10%':
    case '10#':
    case '15%':
      return 'ENH';
    case '15#':
    case '30%':
      return 'MDT';
    case '30#':
    case '45%':
    case '45#':
    case '60%':
    case '60#':
      return 'HIGH';
    default:
      return 'TSTM'; // Default to general thunderstorm
  }
}

/**
 * Convert wind probability to categorical risk level
 * @param probability Wind probability
 * @returns Categorical risk level
 */
export function windToCategorical(probability: WindHailProbability): CategoricalRiskLevel {
  // Conversion table based on Outlook_Info.md
  switch (probability) {
    case '5%':
      return 'MRGL';
    case '15%':
    case '15#':
      return 'SLGT';
    case '30%':
    case '30#':
    case '45%':
      return 'ENH';
    case '45#':
    case '60%':
      return 'MDT';
    case '60#':
      return 'HIGH';
    default:
      return 'TSTM'; // Default to general thunderstorm
  }
}

/**
 * Convert hail probability to categorical risk level
 * @param probability Hail probability
 * @returns Categorical risk level
 */
export function hailToCategorical(probability: WindHailProbability): CategoricalRiskLevel {
  // Conversion table based on Outlook_Info.md
  switch (probability) {
    case '5%':
      return 'MRGL';
    case '15%':
    case '15#':
      return 'SLGT';
    case '30%':
    case '30#':
    case '45%':
      return 'ENH';
    case '45#':
    case '60%':
    case '60#':
      return 'MDT';
    default:
      return 'TSTM'; // Default to general thunderstorm
  }
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
    'TSTM': 0,
    'MRGL': 1,
    'SLGT': 2,
    'ENH': 3,
    'MDT': 4,
    'HIGH': 5
  };
  
  let highestRisk: CategoricalRiskLevel = 'TSTM';
  
  if (tornadoProb) {
    const tornadoRisk = tornadoToCategorical(tornadoProb);
    if (riskValues[tornadoRisk] > riskValues[highestRisk]) {
      highestRisk = tornadoRisk;
    }
  }
  
  if (windProb) {
    const windRisk = windToCategorical(windProb);
    if (riskValues[windRisk] > riskValues[highestRisk]) {
      highestRisk = windRisk;
    }
  }
  
  if (hailProb) {
    const hailRisk = hailToCategorical(hailProb);
    if (riskValues[hailRisk] > riskValues[highestRisk]) {
      highestRisk = hailRisk;
    }
  }
  
  return highestRisk;
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