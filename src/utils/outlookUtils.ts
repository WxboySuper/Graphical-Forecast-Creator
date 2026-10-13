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

export type DetailedCategoricalInput<P extends string = string> = {
  probability: P | SignificantProbability<P>;
  cig?: CIGLevel;
  isSignificant?: boolean;
};

export type SignificantProbability<P extends string> = P extends `${infer Value}%`
  ? `${Value}#` | `${P}#`
  : `${P}#`;

/** Runtime boundary for persisted values; public callers use the narrower CategoricalInput type below. */
type CategoricalConversion = {
  probability: unknown;
  cig: unknown;
  rules: readonly CategoricalRule[];
  significantRisks?: Readonly<Record<string, CategoricalRiskLevel>>;
  maxCigRank?: number;
};
type CategoricalRiskLookup = {
  normalized: NormalizedCategoricalProbability;
  cig: unknown;
  rules: readonly CategoricalRule[];
  significantRisks?: Readonly<Record<string, CategoricalRiskLevel>>;
  maxCigRank?: number;
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
const CIG_RANK: Readonly<Record<CIGLevel, number>> = { CIG0: 0, CIG1: 1, CIG2: 2, CIG3: 3 };
// Build the recognized probability domain from the same keys used by the UI.
const CATEGORICAL_PROBABILITIES: ReadonlySet<string> = new Set([
  ...Object.keys(colorMappings.tornado),
  ...Object.keys(colorMappings.wind),
  ...Object.keys(colorMappings.hail),
  ...Object.keys(colorMappings.totalSevere),
]);
const SIGNIFICANT_PROBABILITY_DOMAINS: Readonly<Record<string, ReadonlySet<string>>> = {
  tornado: new Set(Object.keys(colorMappings.tornado)),
  wind: new Set(Object.keys(colorMappings.wind)),
  hail: new Set(Object.keys(colorMappings.hail)),
  totalSevere: new Set(Object.keys(colorMappings.totalSevere)),
};

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
  return typeof cig === 'string' && CIG_LEVELS.includes(cig.trim() as CIGLevel);
}

/** Normalizes percent and significant-marker probability inputs for rule lookup. */
function normalizeCategoricalProbability(probability: unknown): NormalizedCategoricalProbability | undefined {
  if (typeof probability !== 'string') {
    return undefined;
  }

  const trimmedProbability = probability.trim();
  if (trimmedProbability.length === 0 || /\s/.test(trimmedProbability)) {
    return undefined;
  }

  const suffixMarker = trimmedProbability.match(/^(\d+)(?:%#|#)$/);
  if (suffixMarker) {
    const plainProbability = `${suffixMarker[1]}%`;
    return CATEGORICAL_PROBABILITIES.has(plainProbability)
      ? { probability: plainProbability, significant: true }
      : undefined;
  }

  const plainMatch = trimmedProbability.match(/^(?:\d+)%$/);
  return plainMatch && CATEGORICAL_PROBABILITIES.has(trimmedProbability)
    ? { probability: trimmedProbability, significant: false }
    : undefined;
}

/** Returns whether a rule has a CIG mapping no more significant than the target. */
function ruleAppliesAtOrBelowCig(ruleCigs: readonly CIGLevel[], targetCigRank: number): boolean {
  for (const ruleCig of ruleCigs) {
    const ruleCigRank = CIG_RANK[ruleCig];
    if (ruleCigRank <= targetCigRank) {
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
  return CIG_RANK[cig.trim() as CIGLevel];
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
  if (accumulated === undefined) return candidate;

  const accumulatedRank = CATEGORICAL_RISK_RANK[accumulated];
  if (CATEGORICAL_RISK_RANK[candidate] > accumulatedRank) return candidate;
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
function findCategoricalRisk({ normalized, cig, rules, significantRisks, maxCigRank }: CategoricalRiskLookup): CategoricalRiskLevel {
  if (!rules.some((rule) => rule.probabilities.includes(normalized.probability))) {
    return DEFAULT_CATEGORICAL_RISK;
  }
  const significantRisk = getSignificantCategoricalRisk(normalized, significantRisks);
  const targetCigRank = getTargetCigRank(cig);
  if (targetCigRank === undefined) {
    return DEFAULT_CATEGORICAL_RISK;
  }
  if (maxCigRank !== undefined && targetCigRank > maxCigRank) {
    return significantRisk ?? DEFAULT_CATEGORICAL_RISK;
  }

  // Use a defined lower-significance CIG rule when this probability has no
  // exact mapping. This preserves monotonic risk without promoting low CIGs
  // from a rule that applies only to a more significant hatch.
  const fallbackRisk = findCigFallbackRisk(normalized.probability, targetCigRank, rules) ?? DEFAULT_CATEGORICAL_RISK;
  // Significant markers without a separate product mapping (such as Day 3
  // total severe) retain the corresponding plain-probability CIG category.
  // When both apply, the significant category acts as a floor over CIG risk.
  return significantRisk === undefined ? fallbackRisk : higherCategoricalRisk(significantRisk, fallbackRisk);
}

/** Converts a probability/CIG pair to a categorical risk, defaulting invalid input to TSTM. */
function categorizeProbability({ probability, cig, rules, significantRisks, maxCigRank }: CategoricalConversion): CategoricalRiskLevel {
  const normalizedProbability = normalizeCategoricalProbability(probability);
  if (normalizedProbability === undefined) {
    return DEFAULT_CATEGORICAL_RISK;
  }
  return findCategoricalRisk({ normalized: normalizedProbability, cig, rules, significantRisks, maxCigRank });
}

export type CategoricalInput = DetailedCategoricalInput<string>;

const CIG_01 = ['CIG0', 'CIG1'] as const;
const CIG_12 = ['CIG1', 'CIG2'] as const;
const CIG_012 = ['CIG0', 'CIG1', 'CIG2'] as const;
const CIG_23 = ['CIG2', 'CIG3'] as const;
const CIG_123 = ['CIG1', 'CIG2', 'CIG3'] as const;

// CIG0 values follow docs/product/outlook-info.md. CIG1-CIG3 follow the
// conversion guide in DocumentationContent.tsx; keep both references aligned.
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

/** The current guide shares these CIG1-CIG2 rows; keep product-specific CIG0 values below. */
const HAIL_CIG_RULES: readonly CategoricalRule[] = [
  { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: CIG_12, risk: 'ENH' },
  { probabilities: ['45%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['60%'], cigs: CIG_12, risk: 'MDT' },
];

const HAIL_RULES: readonly CategoricalRule[] = [
  ...HAIL_CIG_RULES,
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['60%'], cigs: ['CIG0'], risk: 'MDT' },
];

const TOTAL_SEVERE_RULES: readonly CategoricalRule[] = [
  { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: ['CIG1'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['45%'], cigs: CIG_12, risk: 'MDT' },
  { probabilities: ['60%'], cigs: CIG_012, risk: 'MDT' },
];

/** Convert tornado probability to categorical risk level. */
export function tornadoToCategorical(input: CategoricalInput): CategoricalRiskLevel {
  return categorizeInput(input, TORNADO_RULES, TORNADO_SIGNIFICANT_RISKS);
}

/** Convert wind probability to categorical risk level. */
export function windToCategorical(input: CategoricalInput): CategoricalRiskLevel {
  return categorizeInput(input, WIND_RULES, WIND_SIGNIFICANT_RISKS);
}

/** Convert hail probability to categorical risk level. */
export function hailToCategorical(input: CategoricalInput): CategoricalRiskLevel {
  return categorizeInput(input, HAIL_RULES, HAIL_SIGNIFICANT_RISKS, CIG_RANK.CIG2);
}

/** Convert Day 3 total severe with the combined-risk table; no separate significant-risk floor applies. */
export function totalSevereToCategorical(input: CategoricalInput): CategoricalRiskLevel {
  return categorizeInput(input, TOTAL_SEVERE_RULES, undefined, CIG_RANK.CIG2);
}

/** Applies one hazard rule table to a normalized public converter input. */
function categorizeInput(
  input: CategoricalInput,
  rules: readonly CategoricalRule[],
  significantRisks?: Readonly<Record<string, CategoricalRiskLevel>>,
  maxCigRank?: number,
): CategoricalRiskLevel {
  const { probability, cig = 'CIG0' } = toCategoricalInput(input);
  return categorizeProbability({ probability, cig, rules, significantRisks, maxCigRank });
}

export type CategoricalConversionRow = {
  probability: string;
  cells: readonly { cig: CIGLevel; risk: CategoricalRiskLevel }[];
};

export type CategoricalConversionTable = {
  cigs: readonly CIGLevel[];
  rows: readonly CategoricalConversionRow[];
};

/** Builds a labeled conversion matrix from the same mapping used by forecasts. */
function createConversionTable(
  probabilities: readonly string[],
  cigs: readonly CIGLevel[],
  convert: (input: CategoricalInput) => CategoricalRiskLevel,
): CategoricalConversionTable {
  return {
    cigs,
    rows: probabilities.map((probability) => ({
      probability,
      cells: cigs.map((cig) => ({ cig, risk: convert({ probability, cig }) })),
    })),
  };
}

/** Reference matrices generated from the same conversion functions used by forecasts. */
export const categoricalConversionTables = {
  tornado: createConversionTable(Object.keys(colorMappings.tornado), CIG_LEVELS, tornadoToCategorical),
  wind: createConversionTable(Object.keys(colorMappings.wind), CIG_LEVELS, windToCategorical),
  hail: createConversionTable(Object.keys(colorMappings.hail), CIG_LEVELS.slice(0, 3), hailToCategorical),
  totalSevere: createConversionTable(Object.keys(colorMappings.totalSevere), CIG_LEVELS.slice(0, 3), totalSevereToCategorical),
};

/** Significant-risk floors shown in the conversion guide; Day 3 has no separate floor. */
export const significantCategoricalFloors = {
  tornado: TORNADO_SIGNIFICANT_RISKS,
  wind: WIND_SIGNIFICANT_RISKS,
  hail: HAIL_SIGNIFICANT_RISKS,
  totalSevere: {},
} satisfies Record<string, Readonly<Record<string, CategoricalRiskLevel>>>;

/**
 * Determines whether an outlook input wrapper contains a valid significant marker.
 * @param input Outlook input object. Missing or non-object values return false.
 * @returns True only for a valid probability with a significant suffix.
 */
export function isSignificantThreat(
  input: { probability: unknown; outlookType?: string } | null | undefined,
): boolean {
  if (!input || typeof input !== 'object') return false;
  const normalized = normalizeCategoricalProbability(input.probability);
  if (!normalized?.significant) return false;
  if (input.outlookType === undefined) return true;
  const outlookType = input.outlookType.trim().toLowerCase();
  return SIGNIFICANT_PROBABILITY_DOMAINS[outlookType]?.has(normalized.probability) === true;
}

/** A supported hazard probability, including significant-marker variants. */
export type CategoricalOutlookValue<P extends string> = P | SignificantProbability<P> | DetailedCategoricalInput<P>;

export type AvailableProbabilities = {
  tornado?: CategoricalOutlookValue<TornadoProbability>;
  wind?: CategoricalOutlookValue<WindProbability>;
  hail?: CategoricalOutlookValue<HailProbability>;
};

/** Converts a plain probability string to the shared categorical input shape. */
function categoricalInputFromProbability(probability: string): CategoricalInput {
  const normalized = normalizeCategoricalProbability(probability);
  if (!normalized) return { probability, cig: 'CIG0' };
  return {
    probability: normalized.significant ? `${normalized.probability}#` : normalized.probability,
    cig: 'CIG0',
  };
}

/** Normalizes a structured input and applies its explicit significance flag. */
function toDetailedCategoricalInput(input: DetailedCategoricalInput): CategoricalInput {
  const normalized = normalizeCategoricalProbability(input.probability);
  if (!normalized) return { probability: input.probability, cig: input.cig };

  const significant = resolveSignificantFlag(input.isSignificant, normalized.significant);
  return {
    probability: significant ? `${normalized.probability}#` : normalized.probability,
    cig: input.cig,
  };
}

/** Converts supported caller forms and fails safely on malformed runtime values. */
function toCategoricalInput<P extends string>(input: CategoricalOutlookValue<P>): CategoricalInput {
  if (typeof input === 'string') return categoricalInputFromProbability(input);
  if (isDetailedCategoricalInput(input)) return toDetailedCategoricalInput(input);
  return { probability: '' };
}

/** Rejects untrusted non-object values before reading structured input fields. */
function isDetailedCategoricalInput(input: unknown): input is DetailedCategoricalInput {
  return input !== null && typeof input === 'object';
}

/** Uses an explicit boolean when valid and otherwise trusts the marker. */
function resolveSignificantFlag(flag: unknown, marked: boolean): boolean {
  if (flag === true) return true;
  if (flag === false) return false;
  return marked;
}

/**
 * Returns the highest mapped risk across the available tornado, wind, and hail outlooks.
 * Plain strings use CIG0, marked strings carry significant state, and object flags override a marker.
 * @param probabilities Available outlook probabilities, or null for missing weather data.
 */
export function getHighestCategoricalRisk(
  probabilities: AvailableProbabilities | null = {},
): CategoricalRiskLevel {
  const { tornado: tornadoProb, wind: windProb, hail: hailProb } = probabilities ?? {};
  const candidates: CategoricalRiskLevel[] = [];
  if (tornadoProb) candidates.push(tornadoToCategorical(toCategoricalInput(tornadoProb)));
  if (windProb) candidates.push(windToCategorical(toCategoricalInput(windProb)));
  if (hailProb) candidates.push(hailToCategorical(toCategoricalInput(hailProb)));

  return candidates.reduce((best, current) => higherCategoricalRisk(best, current), DEFAULT_CATEGORICAL_RISK);
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
