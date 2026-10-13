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
const CIG_LEVELS: readonly CIGLevel[] = ['CIG0', 'CIG1', 'CIG2', 'CIG3'];
// Union of documented significant categories: tornado 10–60%, wind/hail 15–60%.
// Wind 75% and 90% have no significant counterpart in the product guidance.
const SIGNIFICANT_PROBABILITIES: ReadonlySet<string> = new Set(['10%', '15%', '30%', '45%', '60%']);

/** Shared wind and hail significant thresholds from the product outlook guidance. */
const WIND_HAIL_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  '15%': 'SLGT',
  '30%': 'ENH',
  '45%': 'MDT',
};

const TORNADO_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  '10%': 'ENH',
  '15%': 'MDT',
  '30%': 'HIGH',
  '45%': 'HIGH',
  '60%': 'HIGH',
};

const WIND_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  ...WIND_HAIL_SIGNIFICANT_RISKS,
  '60%': 'HIGH',
};

const HAIL_SIGNIFICANT_RISKS: Readonly<Record<string, CategoricalRiskLevel>> = {
  ...WIND_HAIL_SIGNIFICANT_RISKS,
  '60%': 'MDT',
};

/** Narrows an untrusted CIG value to a supported level. */
function isCigLevel(cig: unknown): cig is CIGLevel {
  return typeof cig === 'string' && CIG_LEVELS.includes(cig as CIGLevel);
}

/** Normalizes percent and significant-marker probability inputs for rule lookup. */
function normalizeCategoricalProbability(probability: unknown): NormalizedCategoricalProbability | undefined {
  if (typeof probability !== 'string') {
    return undefined;
  }

  if (probability.length === 0 || /\s/.test(probability)) {
    return undefined;
  }

  const suffixMarker = probability.match(/^(\d+)(?:%#|#)$/);
  if (suffixMarker) {
    const plainProbability = `${suffixMarker[1]}%`;
    return SIGNIFICANT_PROBABILITIES.has(plainProbability)
      ? { probability: plainProbability, significant: true }
      : undefined;
  }

  const plainMatch = probability.match(/^(\d+)%$/);
  return plainMatch
    ? { probability, significant: false }
    : undefined;
}

/** Returns whether a rule has a CIG mapping no more significant than the target. */
function ruleAppliesAtOrBelowCig(ruleCigs: readonly CIGLevel[], targetCigRank: number): boolean {
  for (const ruleCig of ruleCigs) {
    const ruleCigRank = CIG_LEVELS.indexOf(ruleCig);
    if (ruleCigRank >= 0 && ruleCigRank <= targetCigRank) {
      return true;
    }
  }
  return false;
}

/** Resolves a supported CIG label; callers default omitted values before validation. */
function getTargetCigRank(cig: unknown): number | undefined {
  if (!isCigLevel(cig)) {
    return undefined;
  }
  return CIG_LEVELS.indexOf(cig);
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
  accumulated: CategoricalRiskLevel | undefined,
  candidate: CategoricalRiskLevel,
): CategoricalRiskLevel {
  if (accumulated === undefined || CATEGORICAL_RISK_RANK[candidate] > CATEGORICAL_RISK_RANK[accumulated]) {
    return candidate;
  }
  return accumulated;
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

/** Treats a documented significant risk as a floor over the eligible CIG mapping. */
function findCategoricalRisk(
  normalized: NormalizedCategoricalProbability,
  cig: unknown,
  rules: readonly CategoricalRule[],
  significantRisks?: Readonly<Record<string, CategoricalRiskLevel>>,
): CategoricalRiskLevel {
  const significantRisk = getSignificantCategoricalRisk(normalized, significantRisks);
  const targetCigRank = getTargetCigRank(cig);
  if (targetCigRank === undefined) {
    return DEFAULT_CATEGORICAL_RISK;
  }

  // Use a defined lower-significance CIG rule when this probability has no
  // exact mapping. This preserves monotonic risk without promoting low CIGs
  // from a rule that applies only to a more significant hatch.
  const fallbackRisk = findCigFallbackRisk(normalized.probability, targetCigRank, rules) ?? DEFAULT_CATEGORICAL_RISK;
  // Significant markers without a separate product mapping (such as Day 3
  // total severe) retain the corresponding plain-probability CIG category.
  return significantRisk === undefined ? fallbackRisk : higherCategoricalRisk(significantRisk, fallbackRisk);
}

/** Converts a probability/CIG pair to a categorical risk, defaulting invalid input to TSTM. */
function categorizeProbability({ probability, cig, rules, significantRisks }: CategoricalConversion): CategoricalRiskLevel {
  const normalizedProbability = normalizeCategoricalProbability(probability);
  if (normalizedProbability === undefined) {
    return DEFAULT_CATEGORICAL_RISK;
  }
  return findCategoricalRisk(normalizedProbability, cig, rules, significantRisks);
}

export type CategoricalInput = {
  probability: string;
  cig?: CIGLevel;
};

const CIG_01 = ['CIG0', 'CIG1'] as const;
const CIG_12 = ['CIG1', 'CIG2'] as const;
const CIG_23 = ['CIG2', 'CIG3'] as const;
const CIG_123 = ['CIG1', 'CIG2', 'CIG3'] as const;

// CIG0 values follow the conversion tables in docs/product/outlook-info.md.
const TORNADO_RULES: readonly CategoricalRule[] = [
  { probabilities: ['2%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['2%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['5%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['10%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['30%'], cigs: CIG_01, risk: 'MDT' },
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
  { probabilities: ['45%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['60%', '75%', '90%'], cigs: ['CIG0'], risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['60%', '75%', '90%'], cigs: ['CIG1'], risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG3'], risk: 'HIGH' },
  { probabilities: ['60%', '75%', '90%'], cigs: CIG_23, risk: 'HIGH' },
];

/** Shared conversion guidance for hail and Day 3 total severe, copied per table. */
function createHailTotalSevereBaseRules(): CategoricalRule[] {
  const rules: CategoricalRule[] = [
    { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
    { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
    { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
    { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
    { probabilities: ['30%'], cigs: CIG_12, risk: 'ENH' },
    { probabilities: ['45%'], cigs: CIG_01, risk: 'ENH' },
    { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
    { probabilities: ['60%'], cigs: CIG_12, risk: 'MDT' },
  ];
  return rules.map((rule) => ({
    ...rule,
    probabilities: [...rule.probabilities],
    cigs: [...rule.cigs],
  }));
}

const HAIL_RULES: readonly CategoricalRule[] = [
  ...createHailTotalSevereBaseRules(),
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['60%'], cigs: ['CIG0'], risk: 'MDT' },
];

const TOTAL_SEVERE_RULES: readonly CategoricalRule[] = [
  ...createHailTotalSevereBaseRules(),
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'SLGT' },
  { probabilities: ['60%'], cigs: ['CIG0'], risk: 'ENH' },
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
 * @returns True only for a valid probability with a significant suffix.
 */
export function isSignificantThreat({ probability }: { probability: unknown }): boolean {
  return normalizeCategoricalProbability(probability)?.significant === true;
}

/**
 * Get the highest categorical risk level from multiple probabilistic outlooks
 * @param probabilities Available tornado, wind, and hail probabilities
 * @returns The highest mapped risk. String values use CIG0; object values may include CIG and significant state.
 */
export type DetailedCategoricalInput<P extends string = string> = {
  probability: P;
  cig?: CIGLevel;
  isSignificant?: boolean;
};
export type CategoricalOutlookValue<P extends string> = P | DetailedCategoricalInput<P>;

export type AvailableProbabilities = {
  tornado?: CategoricalOutlookValue<TornadoProbability>;
  wind?: CategoricalOutlookValue<WindProbability>;
  hail?: CategoricalOutlookValue<HailProbability>;
};

/** Converts plain or structured outlook values to the shared categorical input shape. */
function toCategoricalInput(input: string | DetailedCategoricalInput): CategoricalInput {
  if (typeof input === 'string') return { probability: input };
  if (
    typeof input.probability !== 'string' ||
    (input.isSignificant !== undefined && typeof input.isSignificant !== 'boolean')
  ) {
    return { probability: '', cig: input.cig };
  }
  const normalized = normalizeCategoricalProbability(input.probability);
  if (!normalized || (input.isSignificant === false && normalized.significant)) {
    return { probability: '', cig: input.cig };
  }
  const isSignificant = input.isSignificant ?? normalized.significant;
  return {
    probability: isSignificant ? `${normalized.probability}#` : normalized.probability,
    cig: input.cig,
  };
}

export function getHighestCategoricalRisk({
  tornado: tornadoProb,
  wind: windProb,
  hail: hailProb,
}: AvailableProbabilities = {}): CategoricalRiskLevel {
  const candidates: CategoricalRiskLevel[] = [];
  if (tornadoProb) candidates.push(tornadoToCategorical(toCategoricalInput(tornadoProb)));
  if (windProb) candidates.push(windToCategorical(toCategoricalInput(windProb)));
  if (hailProb) candidates.push(hailToCategorical(toCategoricalInput(hailProb)));

  return candidates.reduce(higherCategoricalRisk, DEFAULT_CATEGORICAL_RISK);
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
