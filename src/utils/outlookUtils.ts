import { PathOptions } from 'leaflet';
import {
  CategoricalRiskLevel, 
  ColorMappings, 
  OutlookType,
  TornadoProbability, 
  WindProbability,
  HailProbability,
  TotalSevereProbability,
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
        allowsProbabilities: true,
        allowedCIG: [],
        allowedCategorical: [],
        requiresConversion: false,
        probabilities: {
          'day4-8': ['15%', '30%']
        }
      };
    default:
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
  const p = probability.replace(/[#]/g, '%') as TornadoProbability;
  if (p === '2%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';
  if (p === '2%' && cig === 'CIG2') return 'SLGT';
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '10%' && cig === 'CIG0') return 'SLGT';
  if (p === '5%' && cig === 'CIG2') return 'ENH';
  if (p === '10%' && (cig === 'CIG1' || cig === 'CIG2' || cig === 'CIG3')) return 'ENH';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'ENH';
  if ((p === '30%' || p === '45%' || p === '60%') && cig === 'CIG0') return 'ENH';
  if (p === '15%' && (cig === 'CIG2' || cig === 'CIG3')) return 'MDT';
  if ((p === '30%' || p === '45%') && cig === 'CIG1') return 'MDT';
  if ((p === '30%' || p === '45%') && (cig === 'CIG2' || cig === 'CIG3')) return 'HIGH';
  if (p === '60%' && (cig === 'CIG1' || cig === 'CIG2' || cig === 'CIG3')) return 'HIGH';
  return 'TSTM';
}

/**
 * Convert wind probability to categorical risk level
 */
export function windToCategorical(probability: string, cig: CIGLevel = 'CIG0'): CategoricalRiskLevel {
  const p = probability.replace(/[#]/g, '%') as WindProbability;
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';
  if (p === '5%' && cig === 'CIG2') return 'SLGT';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '30%' && cig === 'CIG0') return 'SLGT';
  if (p === '15%' && cig === 'CIG2') return 'ENH';
  if (p === '30%' && (cig === 'CIG1' || cig === 'CIG2')) return 'ENH';
  if (['45%', '60%', '75%', '90%'].includes(p) && cig === 'CIG0') return 'ENH';
  if (p === '45%' && cig === 'CIG1') return 'ENH';
  if (p === '45%' && cig === 'CIG2') return 'MDT';
  if (['60%', '75%', '90%'].includes(p) && cig === 'CIG1') return 'MDT';
  if (p === '45%' && cig === 'CIG3') return 'HIGH';
  if (['60%', '75%', '90%'].includes(p) && (cig === 'CIG2' || cig === 'CIG3')) return 'HIGH';
  return 'TSTM';
}

/**
 * Convert hail probability to categorical risk level
 */
export function hailToCategorical(probability: string, cig: CIGLevel = 'CIG0'): CategoricalRiskLevel {
  const p = probability.replace(/[#]/g, '%') as HailProbability;
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';
  if (p === '5%' && cig === 'CIG2') return 'SLGT';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '30%' && cig === 'CIG0') return 'SLGT';
  if (p === '15%' && cig === 'CIG2') return 'ENH';
  if (p === '30%' && (cig === 'CIG1' || cig === 'CIG2')) return 'ENH';
  if (p === '45%' && (cig === 'CIG0' || cig === 'CIG1')) return 'ENH';
  if (p === '60%' && cig === 'CIG0') return 'ENH';
  if (p === '45%' && cig === 'CIG2') return 'MDT';
  if (p === '60%' && (cig === 'CIG1' || cig === 'CIG2')) return 'MDT';
  return 'TSTM';
}

/**
 * Convert Day 3 Total Severe probability to categorical risk level
 */
export function totalSevereToCategorical(probability: string, cig: CIGLevel = 'CIG0'): CategoricalRiskLevel {
  const p = probability.replace(/[#]/g, '%') as TotalSevereProbability;
  if (p === '5%' && (cig === 'CIG0' || cig === 'CIG1')) return 'MRGL';
  if (p === '5%' && cig === 'CIG2') return 'SLGT';
  if (p === '15%' && (cig === 'CIG0' || cig === 'CIG1')) return 'SLGT';
  if (p === '30%' && cig === 'CIG0') return 'SLGT';
  if (p === '15%' && cig === 'CIG2') return 'ENH';
  if (p === '30%' && (cig === 'CIG1' || cig === 'CIG2')) return 'ENH';
  if (p === '45%' && (cig === 'CIG0' || cig === 'CIG1')) return 'ENH';
  if (p === '60%' && cig === 'CIG0') return 'ENH';
  if (p === '45%' && cig === 'CIG2') return 'MDT';
  if (p === '60%' && (cig === 'CIG1' || cig === 'CIG2')) return 'MDT';
  return 'TSTM';
}

// ---- Map Styling and Rendering Helpers ----

export const RISK_ORDER: Record<string, number> = {
  'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5
};

export const lookupColor = (outlookType: OutlookType, probability: string): string => {
  switch (outlookType) {
    case 'categorical':
      return colorMappings.categorical[probability as keyof typeof colorMappings.categorical] || '#FFFFFF';
    case 'tornado':
      return colorMappings.tornado[probability as keyof typeof colorMappings.tornado] || '#FFFFFF';
    case 'wind':
      return colorMappings.wind[probability as keyof typeof colorMappings.wind] || '#FFFFFF';
    case 'hail':
      return colorMappings.hail[probability as keyof typeof colorMappings.hail] || '#FFFFFF';
    case 'totalSevere':
      return colorMappings.totalSevere[probability as keyof typeof colorMappings.totalSevere] || '#FFFFFF';
    case 'day4-8':
      return colorMappings['day4-8'][probability as keyof typeof colorMappings['day4-8']] || '#FFFFFF';
    default:
      return '#FFFFFF';
  }
};

export const computeZIndex = (outlookType: OutlookType, probability: string): number => {
  let baseZIndex = 400;
  if (outlookType === 'categorical') {
    baseZIndex += (RISK_ORDER[probability] || 0) * 10;
  } else if (['tornado', 'wind', 'hail', 'totalSevere', 'day4-8'].includes(outlookType)) {
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
  return [...entries].sort((a, b) => {
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
