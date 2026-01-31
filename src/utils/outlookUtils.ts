import {
  CategoricalRiskLevel, 
  ColorMappings, 
  TornadoProbability, 
  WindProbability,
  HailProbability,
  TotalSevereProbability,
  Day48Probability,
  CIGLevel,
  DayType
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
    '60#': '#912bee',
    '75%': '#cd00cd',
    '75#': '#cd00cd',
    '90%': '#0000cd',
    '90#': '#0000cd'
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
  totalSevere: {
    '5%': '#008b02',
    '15%': '#fdc900',
    '30%': '#fe0000',
    '45%': '#fe00ff',
    '60%': '#114d8c'
  },
  'day4-8': {
    '15%': '#FFFF00', // Yellow
    '30%': '#FF8C00'  // Orange
  },
  significant: '#000000', // Black hatch for significant threat areas
  hatching: {
    'CIG0': 'none',
    'CIG1': 'url(#pattern-cig1)',
    'CIG2': 'url(#pattern-cig2)',
    'CIG3': 'url(#pattern-cig3)'
  }
};

/**
 * Get constraints for a specific outlook day
 */
export function getOutlookConstraints(day: DayType) {
  switch (day) {
    case 1:
    case 2:
      return {
        outlookTypes: ['tornado', 'wind', 'hail', 'categorical'] as const,
        allowsProbabilities: true,
        allowedCIG: ['CIG1', 'CIG2', 'CIG3'],
        allowedCategorical: ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'],
        requiresConversion: true,
        probabilities: {
          tornado: ['2%', '5%', '10%', '15%', '30%', '45%', '60%'],
          wind: ['5%', '15%', '30%', '45%', '60%', '75%', '90%'],
          hail: ['5%', '15%', '30%', '45%', '60%']
        }
      };
    case 3:
      return {
        outlookTypes: ['totalSevere', 'categorical'] as const,
        allowsProbabilities: true,
        allowedCIG: ['CIG1', 'CIG2'],
        allowedCategorical: ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT'], // No HIGH
        requiresConversion: true,
        probabilities: {
          totalSevere: ['5%', '15%', '30%', '45%', '60%']
        }
      };
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
      return {
        outlookTypes: ['day4-8'] as const,
        allowsProbabilities: true, // Day 4-8 is probabilistic, not categorical
        allowedCIG: [],
        allowedCategorical: [], // No categorical conversion
        requiresConversion: false,
        probabilities: {
          'day4-8': ['15%', '30%']
        }
      };
    default:
      // Fallback for unexpected values
      return {
        outlookTypes: [] as const,
        allowsProbabilities: false,
        allowedCIG: [],
        allowedCategorical: [],
        requiresConversion: false,
        probabilities: {}
      };
  }
}

/**
 * Convert tornado probability to categorical risk level
 */
export function tornadoToCategorical(probability: string, cig: CIGLevel = 'CIG0'): CategoricalRiskLevel {
  // Clean probability string
  const p = probability.replace(/[#]/g, '%') as TornadoProbability;
  
  // Logic based on New Outlook Format Prompt
  // MRGL
  if (p === '2%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';
  
  // SLGT
  if (p === '2%' && cig === 'CIG2') return 'SLGT';
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '10%' && cig === 'CIG0') return 'SLGT';

  // ENH
  if (p === '5%' && cig === 'CIG2') return 'ENH'; // Prompt says 5% CIG2 -> ENH? Wait, checking table. "ENH... 5%: CIG 2". Yes.
  if (p === '10%' && (cig === 'CIG1' || cig === 'CIG2' || cig === 'CIG3')) return 'ENH';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'ENH';
  if ((p === '30%' || p === '45%' || p === '60%') && cig === 'CIG0') return 'ENH';

  // MDT
  if (p === '15%' && (cig === 'CIG2' || cig === 'CIG3')) return 'MDT';
  if ((p === '30%' || p === '45%') && cig === 'CIG1') return 'MDT';

  // HIGH
  if ((p === '30%' || p === '45%') && (cig === 'CIG2' || cig === 'CIG3')) return 'HIGH';
  if (p === '60%' && (cig === 'CIG1' || cig === 'CIG2' || cig === 'CIG3')) return 'HIGH';

  // Fallback for combinations not listed (usually lower or invalid)
  // Assuming default behavior or legacy mapping if strict matching fails?
  // Let's stick strictly to the prompt. If not matched, maybe TSTM?
  // But wait, 2% is minimum for Tornado.
  
  // Safety fallbacks for legacy codes (e.g. # sig)
  // If probability has # (legacy), we assume CIG1/Significant equivalent?
  // But the prompt wants precise mapping.
  
  return 'TSTM';
}

/**
 * Convert wind probability to categorical risk level
 */
export function windToCategorical(probability: string, cig: CIGLevel = 'CIG0'): CategoricalRiskLevel {
  const p = probability.replace(/[#]/g, '%') as WindProbability;

  // MRGL
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';

  // SLGT
  if (p === '5%' && cig === 'CIG2') return 'SLGT';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '30%' && cig === 'CIG0') return 'SLGT';

  // ENH
  if (p === '15%' && cig === 'CIG2') return 'ENH';
  if (p === '30%' && (cig === 'CIG1' || cig === 'CIG2')) return 'ENH';
  if ((p === '45%' || p === '60%' || p === '75%' || p === '90%') && (cig === 'CIG0' || cig === 'CIG1')) return 'ENH'; // Prompt says 45,60,75,90 CIG0 -> ENH. Table: "45%: CIG 0, 1". "60%: CIG 0". "75%: CIG 0". "90%: CIG 0".
  // Correction from prompt:
  // ENH: 45%: CIG 0, 1. 
  // ENH: 60%: CIG 0.
  // ENH: 75%: CIG 0.
  // ENH: 90%: CIG 0.
  if (p === '45%' && cig === 'CIG1') return 'ENH';
  if (['45%', '60%', '75%', '90%'].includes(p) && cig === 'CIG0') return 'ENH';

  // MDT
  if (p === '45%' && cig === 'CIG2') return 'MDT';
  if (['60%', '75%', '90%'].includes(p) && cig === 'CIG1') return 'MDT';

  // HIGH
  if (p === '45%' && cig === 'CIG3') return 'HIGH';
  if (['60%', '75%', '90%'].includes(p) && (cig === 'CIG2' || cig === 'CIG3')) return 'HIGH';

  return 'TSTM';
}

/**
 * Convert hail probability to categorical risk level
 */
export function hailToCategorical(probability: string, cig: CIGLevel = 'CIG0'): CategoricalRiskLevel {
  const p = probability.replace(/[#]/g, '%') as HailProbability;

  // MRGL
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';

  // SLGT
  if (p === '5%' && cig === 'CIG2') return 'SLGT';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '30%' && cig === 'CIG0') return 'SLGT';

  // ENH
  if (p === '15%' && cig === 'CIG2') return 'ENH';
  if (p === '30%' && (cig === 'CIG1' || cig === 'CIG2')) return 'ENH';
  if (p === '45%' && (cig === 'CIG0' || cig === 'CIG1')) return 'ENH';
  if (p === '60%' && cig === 'CIG0') return 'ENH';

  // MDT
  if (p === '45%' && cig === 'CIG2') return 'MDT';
  if (p === '60%' && (cig === 'CIG1' || cig === 'CIG2')) return 'MDT';

  // Hail doesn't seem to go to HIGH in the prompt provided?
  // "MDT... 60%: CIG 1, 2".
  // Prompt ends there for Hail. No HIGH listed.

  return 'TSTM';
}

/**
 * Convert Day 3 Total Severe probability to categorical risk level
 * Day 3 uses a combined threat model, not separate tornado/wind/hail
 */
export function totalSevereToCategorical(probability: string, cig: CIGLevel = 'CIG0'): CategoricalRiskLevel {
  const p = probability.replace(/[#]/g, '%') as TotalSevereProbability;
  
  // Day 3 Categorical Conversion from prompt:
  // MRGL: 5%: CIG 0, 1
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';
  
  // SLGT: 5%: CIG 2; 15%: CIG 0, 1; 30%: CIG 0
  if (p === '5%' && cig === 'CIG2') return 'SLGT';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '30%' && cig === 'CIG0') return 'SLGT';
  
  // ENH: 15%: CIG 2; 30%: CIG 1, 2; 45%: CIG 0, 1; 60%: CIG 0
  if (p === '15%' && cig === 'CIG2') return 'ENH';
  if (p === '30%' && (cig === 'CIG1' || cig === 'CIG2')) return 'ENH';
  if (p === '45%' && (cig === 'CIG0' || cig === 'CIG1')) return 'ENH';
  if (p === '60%' && cig === 'CIG0') return 'ENH';
  
  // MDT: 45%: CIG 2; 60%: CIG 1, 2
  if (p === '45%' && cig === 'CIG2') return 'MDT';
  if (p === '60%' && (cig === 'CIG1' || cig === 'CIG2')) return 'MDT';
  
  // Note: Day 3 does not have HIGH risk level
  
  return 'TSTM';
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
  windProb?: WindProbability,
  hailProb?: HailProbability
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