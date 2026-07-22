import { FORECAST_GRADE_FORMULA_VERSION } from './formulaVersion';

/**
 * Forecast Grade contract (PR 01 — formula-contract).
 *
 * Pure types and scalar helpers shared by every stage of the gfc-ver-1 engine.
 * No geometry or report parsing lives here so the contract can be imported by
 * UI, tests, and history persistence without pulling in turf.
 */

/** Severe hazards with their own probabilistic contours and sig thresholds. */
export type HazardKind = 'tornado' | 'wind' | 'hail';

export const HAZARD_KINDS: readonly HazardKind[] = ['tornado', 'wind', 'hail'] as const;

/**
 * Products graded and rolled up into the package. Categorical is derived from the
 * hazard contours and verified against every relevant report; severity is Not
 * evaluated for categorical because significant contours are hazard-specific.
 */
export type ProductKind = 'categorical' | HazardKind;

export const PRODUCT_KINDS: readonly ProductKind[] = ['categorical', 'tornado', 'wind', 'hail'] as const;

export const PRODUCT_LABELS: Record<ProductKind, string> = {
  categorical: 'Categorical',
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
};

/** The five composite components of a single-product Forecast Grade. */
export type ComponentKey =
  | 'probabilitySkill'
  | 'spatialContingency'
  | 'farDiscipline'
  | 'eventYield'
  | 'severity';

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Data quality is a descriptive gate, never a hidden weight on the score.
 * - Good: enough geometry and reports to trust every applicable component.
 * - Limited: gradable, but sparse reports or few applicable components.
 * - Blocked: geometry gate failed or reports could not be loaded — no grade.
 */
export type DataQuality = 'Good' | 'Limited' | 'Blocked';

/** Composite weights (percent). Renormalized over applicable components. */
export const COMPONENT_WEIGHTS: Record<ComponentKey, number> = {
  probabilitySkill: 25,
  spatialContingency: 25,
  farDiscipline: 15,
  eventYield: 25,
  severity: 10,
};

/** Human-readable component labels used by the dashboard and exports. */
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  probabilitySkill: 'Probability skill',
  spatialContingency: 'Spatial contingency',
  farDiscipline: 'False-alarm discipline',
  eventYield: 'Event yield',
  severity: 'Severity',
};

export const COMPONENT_ORDER: readonly ComponentKey[] = [
  'probabilitySkill',
  'spatialContingency',
  'farDiscipline',
  'eventYield',
  'severity',
];

/** One scored (or N/A) composite component for a single hazard product. */
export interface ComponentScore {
  key: ComponentKey;
  label: string;
  /** Nominal composite weight (percent) before renormalization. */
  weight: number;
  /** Normalized component score in [0, 1], or null when Not evaluated. */
  score: number | null;
  /** False when the component is Not evaluated (renormalized out). */
  applicable: boolean;
  /** Short factual metrics sentence — never coaching prose. */
  detail: string;
  /** Raw metrics for the breakdown drawer and share/export payloads. */
  metrics?: Record<string, number>;
}

/** Grade for a single product (categorical, tornado, wind, or hail). */
export interface ProductGrade {
  product: ProductKind;
  label: string;
  /** 0–100 with one decimal, or null when the product is Not evaluated. */
  grade: number | null;
  letter: LetterGrade | null;
  components: ComponentScore[];
  /** False when nothing was forecast and nothing observed for this product. */
  applicable: boolean;
  reportCount: number;
}

/** Package grade across every present hazard product. */
export interface PackageGrade {
  formulaVersion: typeof FORECAST_GRADE_FORMULA_VERSION;
  /** Equal-weight mean of present product grades; null when Blocked. */
  grade: number | null;
  letter: LetterGrade | null;
  products: ProductGrade[];
  dataQuality: DataQuality;
  dataQualityReason: string;
  /** True when at least one storm report was supplied. */
  hasReports: boolean;
  generatedAt: string;
}

/** Clamps a finite value into the inclusive [min, max] range; non-finite input becomes min. */
export const clamp = (value: number, min = 0, max = 1): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

/** Rounds a 0–100 grade to a single decimal place. */
export const roundGrade = (grade: number): number => Math.round(grade * 10) / 10;

/** Maps a 0–100 grade to a letter. A≥90 B≥80 C≥70 D≥60 F<60. */
export const scoreToLetter = (grade: number | null): LetterGrade | null => {
  if (grade === null || Number.isNaN(grade)) {
    return null;
  }
  if (grade >= 90) return 'A';
  if (grade >= 80) return 'B';
  if (grade >= 70) return 'C';
  if (grade >= 60) return 'D';
  return 'F';
};

/**
 * Combines component scores into a 0–100 product grade, renormalizing the
 * weights over only the applicable (non-N/A) components. Returns null when no
 * component is applicable.
 */
export const composeComponents = (components: ComponentScore[]): number | null => {
  let weightSum = 0;
  let weighted = 0;

  for (const component of components) {
    if (!component.applicable || component.score === null || !Number.isFinite(component.score)) {
      continue;
    }
    weightSum += component.weight;
    weighted += component.weight * component.score;
  }

  if (weightSum === 0) {
    return null;
  }

  return roundGrade((weighted / weightSum) * 100);
};

/** Builds a Not-evaluated component placeholder with a factual reason. */
export const notEvaluatedComponent = (key: ComponentKey, detail: string): ComponentScore => ({
  key,
  label: COMPONENT_LABELS[key],
  weight: COMPONENT_WEIGHTS[key],
  score: null,
  applicable: false,
  detail,
});

/** Builds a scored component with normalized score and metrics. */
export const scoredComponent = (
  key: ComponentKey,
  score: number,
  detail: string,
  metrics?: Record<string, number>
): ComponentScore => {
  const normalized = clamp(score);
  return {
    key,
    label: COMPONENT_LABELS[key],
    weight: COMPONENT_WEIGHTS[key],
    score: normalized,
    applicable: true,
    detail,
    metrics,
  };
};

export { FORECAST_GRADE_FORMULA_VERSION };
