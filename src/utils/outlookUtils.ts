import {
  CategoricalRiskLevel,
  ColorMappings,
  CIGLevel,
  TornadoProbability,
  WindProbability,
  HailProbability
} from '../types/outlooks';
export { getOutlookConstraints } from './outlookConstraints';

/**
 * Color mappings for all outlook types based on specifications in docs/product/outlook-info.md
 */
export const colorMappings: ColorMappings = {
  categorical: {
    'TSTM': '#C1E9C1', // General Thunderstorm (0/5)
    'MRGL': '#66A366', // Marginal (1/5) - Darker green
    'SLGT': '#FFE066', // Slight (2/5) - Golden yellow
    'ENH': '#FFA366',  // Enhanced (3/5) - Bright orange
    'MDT': '#E06666',  // Moderate (4/5) - Red
    'HIGH': '#EE99EE'  // High (5/5) - Magenta
  },
  tornado: {
    '2%': '#79BA7A',
    '5%': '#BD998A',
    '10%': '#FFE481',
    '15%': '#FF8080',
    '30%': '#FF80FF',
    '45%': '#C896F7',
    '60%': '#104E8B',
  },
  wind: {
    '5%': '#C5A392',
    '15%': '#FFEB7F',
    '30%': '#FF7F7F',
    '45%': '#FF7FFF',
    '60%': '#C895F6',
    '75%': '#5C85D6',
    '90%': '#1AFFFF',
  },
  hail: {
    '5%': '#C5A392',
    '15%': '#FFEB7F',
    '30%': '#FF7F7F',
    '45%': '#FF7FFF',
    '60%': '#C895F6',
  },
  totalSevere: {
    '5%': '#C5A392',
    '15%': '#FFEB7F',
    '30%': '#FF7F7F',
    '45%': '#FF7FFF',
    '60%': '#C895F6'
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

type CategoricalRule = {
  probabilities: readonly string[];
  cigs: readonly CIGLevel[];
  risk: CategoricalRiskLevel;
};

type NormalizedCategoricalProbability = {
  probability: string;
  significant: boolean;
};

/** Runtime boundary for persisted values; public callers use the narrower CategoricalInput type below. */
type CategoricalConversion = {
  probability: unknown;
  cig: unknown;
  rules: readonly CategoricalRule[];
  significantRisks?: Readonly<Record<string, CategoricalRiskLevel>>;
};

const CATEGORICAL_RISK_RANK: Readonly<Record<CategoricalRiskLevel, number>> = {
  TSTM: 0,
  MRGL: 1,
  SLGT: 2,
  ENH: 3,
  MDT: 4,
  HIGH: 5,
};
const DEFAULT_CATEGORICAL_RISK: CategoricalRiskLevel = 'TSTM';

const COMMON_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  '15%': 'SLGT',
  '30%': 'ENH',
  '45%': 'MDT',
};

const TORNADO_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  ...COMMON_SIGNIFICANT_RISKS,
  '10%': 'ENH',
  '15%': 'MDT',
  '30%': 'HIGH',
  '45%': 'HIGH',
  '60%': 'HIGH',
};

const WIND_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  ...COMMON_SIGNIFICANT_RISKS,
  '60%': 'HIGH',
};

const HAIL_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  ...COMMON_SIGNIFICANT_RISKS,
  '60%': 'MDT',
};

const CIG_SIGNIFICANCE_RANK: Readonly<Record<CIGLevel, number>> = {
  CIG0: 0,
  CIG1: 1,
  CIG2: 2,
  CIG3: 3,
};

const CIG_LEVELS: readonly CIGLevel[] = ['CIG0', 'CIG1', 'CIG2', 'CIG3'];

/** Narrows an untrusted CIG value to a supported level. */
function isCigLevel(cig: unknown): cig is CIGLevel {
  return typeof cig === 'string' && CIG_LEVELS.some((level) => level === cig);
}

/** Normalizes percent and significant-marker probability inputs for rule lookup. */
function normalizeCategoricalProbability(probability: unknown): NormalizedCategoricalProbability | undefined {
  if (typeof probability !== 'string') {
    return undefined;
  }

  const compactProbability = probability.trim();
  if (compactProbability.length === 0) {
    return undefined;
  }
  if (/\s/.test(compactProbability)) {
    return undefined;
  }

  const suffixMarker = compactProbability.match(/^(\d+)(?:%#|#)$/);
  if (suffixMarker) {
    return { probability: `${suffixMarker[1]}%`, significant: true };
  }

  const plainMatch = compactProbability.match(/^(\d+)%$/);
  return plainMatch
    ? { probability: `${plainMatch[1]}%`, significant: false }
    : undefined;
}

/** Returns whether a rule has a CIG mapping no more significant than the target. */
function ruleAppliesAtOrBelowCig(ruleCigs: readonly CIGLevel[], targetCigRank: number): boolean {
  for (const ruleCig of ruleCigs) {
    const ruleCigRank: number | undefined = CIG_SIGNIFICANCE_RANK[ruleCig];
    if (ruleCigRank !== undefined && ruleCigRank <= targetCigRank) {
      return true;
    }
  }
  return false;
}

/** Resolves CIG labels from stored data, using CIG0 for absent or empty values. */
function getTargetCigRank(cig: unknown): number | undefined {
  if (!isCigLevel(cig)) {
    return undefined;
  }
  return CIG_SIGNIFICANCE_RANK[cig];
}

/** Finds a documented category for a significant probability marker. */
function getSignificantCategoricalRisk(
  normalized: NormalizedCategoricalProbability,
  significantRisks?: Readonly<Record<string, CategoricalRiskLevel>>,
): CategoricalRiskLevel | undefined {
  return normalized.significant ? significantRisks?.[normalized.probability] : undefined;
}

/** Keeps the higher risk, treating an absent accumulated value as the first candidate. */
function higherCategoricalRisk(
  current: CategoricalRiskLevel | undefined,
  candidate: CategoricalRiskLevel,
): CategoricalRiskLevel {
  if (current === undefined || CATEGORICAL_RISK_RANK[candidate] > CATEGORICAL_RISK_RANK[current]) {
    return candidate;
  }
  return current;
}

/** Finds the highest mapped risk at or below the target CIG. */
function findCigFallbackRisk(
  probability: string,
  targetCigRank: number,
  rules: readonly CategoricalRule[],
): CategoricalRiskLevel | undefined {
  let fallbackRisk: CategoricalRiskLevel | undefined;
  for (const rule of rules) {
    if (!rule.probabilities.includes(probability)) {
      continue;
    }
    if (!ruleAppliesAtOrBelowCig(rule.cigs, targetCigRank)) {
      continue;
    }
    fallbackRisk = higherCategoricalRisk(fallbackRisk, rule.risk);
  }
  return fallbackRisk;
}

/** Uses a documented significant risk when present, otherwise the highest eligible CIG mapping. */
function findCategoricalRisk(
  normalized: NormalizedCategoricalProbability,
  cig: unknown,
  rules: readonly CategoricalRule[],
  significantRisks?: Readonly<Record<string, CategoricalRiskLevel>>,
): CategoricalRiskLevel {
  const significantRisk = getSignificantCategoricalRisk(normalized, significantRisks);
  if (normalized.significant && significantRisk === undefined) {
    return DEFAULT_CATEGORICAL_RISK;
  }
  const targetCigRank = getTargetCigRank(cig);
  if (targetCigRank === undefined) {
    return significantRisk ?? DEFAULT_CATEGORICAL_RISK;
  }

  // Use a defined lower-significance CIG rule when this probability has no
  // exact mapping. This preserves monotonic risk without promoting low CIGs
  // from a rule that applies only to a more significant hatch.
  const fallbackRisk = findCigFallbackRisk(normalized.probability, targetCigRank, rules);
  if (significantRisk !== undefined) {
    return higherCategoricalRisk(fallbackRisk, significantRisk);
  }
  return fallbackRisk ?? DEFAULT_CATEGORICAL_RISK;
}

/** Converts a probability/CIG pair to a categorical risk, defaulting invalid input to TSTM. */
function categorizeProbability({ probability, cig, rules, significantRisks }: CategoricalConversion): CategoricalRiskLevel {
  const normalizedProbability = normalizeCategoricalProbability(probability);
  if (normalizedProbability === undefined) {
    return DEFAULT_CATEGORICAL_RISK;
  }
  return findCategoricalRisk(normalizedProbability, cig, rules, significantRisks);
}

type CategoricalInput = {
  probability: string;
  cig?: CIGLevel;
};

const CIG_01 = ['CIG0', 'CIG1'] as const;
const CIG_12 = ['CIG1', 'CIG2'] as const;
const CIG_23 = ['CIG2', 'CIG3'] as const;
const CIG_123 = ['CIG1', 'CIG2', 'CIG3'] as const;
const CIG_ALL = ['CIG0', 'CIG1', 'CIG2', 'CIG3'] as const;

const TORNADO_RULES: readonly CategoricalRule[] = [
  { probabilities: ['2%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['2%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['5%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['10%'], cigs: CIG_ALL, risk: 'ENH' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['30%'], cigs: ['CIG0', 'CIG1'], risk: 'MDT' },
  { probabilities: ['45%', '60%'], cigs: ['CIG0'], risk: 'HIGH' },
  { probabilities: ['15%'], cigs: CIG_23, risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG1'], risk: 'HIGH' },
  { probabilities: ['30%', '45%'], cigs: CIG_23, risk: 'HIGH' },
  { probabilities: ['60%'], cigs: CIG_123, risk: 'HIGH' },
];

const WIND_RULES: readonly CategoricalRule[] = [
  { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: CIG_12, risk: 'ENH' },
  { probabilities: ['45%'], cigs: ['CIG1'], risk: 'ENH' },
  { probabilities: ['45%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['60%', '75%', '90%'], cigs: ['CIG0'], risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['60%', '75%', '90%'], cigs: ['CIG1'], risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG3'], risk: 'HIGH' },
  { probabilities: ['60%', '75%', '90%'], cigs: CIG_23, risk: 'HIGH' },
];

const HAIL_RULES: readonly CategoricalRule[] = [
  { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: CIG_12, risk: 'ENH' },
  { probabilities: ['45%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['60%'], cigs: ['CIG0'], risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['60%'], cigs: CIG_12, risk: 'MDT' },
];

const TOTAL_SEVERE_RULES: readonly CategoricalRule[] = [
  { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: CIG_12, risk: 'ENH' },
  { probabilities: ['45%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['60%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['60%'], cigs: CIG_12, risk: 'MDT' },
];

/** Convert tornado probability to categorical risk level. */
export function tornadoToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: TORNADO_RULES, significantRisks: TORNADO_SIGNIFICANT_RISKS });
}

/** Convert wind probability to categorical risk level. */
export function windToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: WIND_RULES, significantRisks: WIND_SIGNIFICANT_RISKS });
}

/** Convert hail probability to categorical risk level. */
export function hailToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: HAIL_RULES, significantRisks: HAIL_SIGNIFICANT_RISKS });
}

/** Convert Day 3 total severe probability using the SPC combined-risk table. */
export function totalSevereToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: TOTAL_SEVERE_RULES });
}

/**
 * Determines if a valid probability key has a significant marker.
 * @param probability The probability string to check. Non-strings return false.
 * @returns True if the probability contains #, false otherwise.
 */
export function isSignificantThreat({ probability }: Pick<CategoricalInput, 'probability'>): boolean {
  const probabilityValue: unknown = probability;
  return normalizeCategoricalProbability(probabilityValue)?.significant === true;
}

/**
 * Get the highest categorical risk level from multiple probabilistic outlooks
 * @param probabilities Available tornado, wind, and hail probabilities
 * @returns The highest categorical risk level using CIG0 for each outlook
 */
type AvailableProbabilities = {
  tornado?: TornadoProbability;
  wind?: WindProbability;
  hail?: HailProbability;
};

export function getHighestCategoricalRisk({
  tornado: tornadoProb,
  wind: windProb,
  hail: hailProb,
}: AvailableProbabilities = {}): CategoricalRiskLevel {
  const candidates: CategoricalRiskLevel[] = [];
  if (tornadoProb) candidates.push(tornadoToCategorical({ probability: tornadoProb }));
  if (windProb) candidates.push(windToCategorical({ probability: windProb }));
  if (hailProb) candidates.push(hailToCategorical({ probability: hailProb }));

  if (candidates.length === 0) return DEFAULT_CATEGORICAL_RISK;

  return candidates.reduce((best, current) => higherCategoricalRisk(best, current), candidates[0]);
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

/**
 * Gets the color for an outlook type and probability/risk level
 * @param input The outlook type and probability or risk level
 * @returns The hex color code
 */
type OutlookColorInput = {
  outlookType: string;
  probability: string;
};

export function getOutlookColor({ outlookType, probability }: OutlookColorInput): string {
  if (outlookType in colorMappings) {
    const typeColors = colorMappings[outlookType as keyof typeof colorMappings];
    if (typeof typeColors === 'object' && probability in typeColors) {
      return typeColors[probability as keyof typeof typeColors] || '#808080';
    }
  }
  return '#808080'; // Default gray
}
